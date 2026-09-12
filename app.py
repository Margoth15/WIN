#!/usr/bin/env python3
"""
WIN Wi-Fi Scanner Web - Backend Server
Servidor HTTP ligero basado en la biblioteca estándar de Python.
Permite escanear redes Wi-Fi locales en Windows mediante netsh wlan y PowerShell,
analizando SSID, BSSID, potencia de señal, canales, frecuencias y tipos de cifrado.
"""

import http.server
import json
import os
import re
import socket
import subprocess
import sys
import urllib.parse
from datetime import datetime

# Garantizar codificación UTF-8 en consola de Windows
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PORT = 5000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")


def get_wifi_adapter_info():
    """Obtiene información sobre el adaptador Wi-Fi de Windows usando PowerShell."""
    info = {
        "name": "Wi-Fi",
        "status": "Desconocido",
        "link_speed": "N/A",
        "mac_address": "N/A",
        "detected": False
    }
    try:
        cmd = [
            "powershell", "-NoProfile", "-Command",
            "Get-NetAdapter -Name *Wi-Fi* -ErrorAction SilentlyContinue | "
            "Select-Object -First 1 Name, Status, LinkSpeed, MacAddress | "
            "ConvertTo-Json"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            info["name"] = data.get("Name", "Wi-Fi")
            info["status"] = data.get("Status", "Activo")
            info["link_speed"] = data.get("LinkSpeed", "N/A")
            info["mac_address"] = data.get("MacAddress", "N/A")
            info["detected"] = True
    except Exception as e:
        print(f"[Aviso] No se pudo obtener información del adaptador: {e}")
    return info


def calculate_band(channel):
    """Calcula la banda de frecuencia según el número de canal Wi-Fi."""
    try:
        ch = int(channel)
        if 1 <= ch <= 14:
            return "2.4 GHz"
        elif 32 <= ch <= 177:
            return "5 GHz"
        elif ch > 177:
            return "6 GHz (Wi-Fi 6E)"
    except (ValueError, TypeError):
        pass
    return "Desconocida"


def signal_to_dbm(percentage):
    """Convierte porcentaje de señal (0-100%) a un estimado en dBm."""
    try:
        pct = float(percentage)
        # Fórmula estándar aproximada de Windows: dBm = (pct / 2) - 100
        # 100% -> -50 dBm, 50% -> -75 dBm, 0% -> -100 dBm
        return round((pct / 2.0) - 100)
    except (ValueError, TypeError):
        return -100


def get_local_ip():
    """Obtiene la IP LAN de la máquina en la red local (ej: 192.168.100.5)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


def get_connection_info():
    """
    Lee la señal WiFi del adaptador activo con netsh wlan show interfaces.
    Retorna dict con: type ('wifi'|'unknown'), ssid, signal_pct, signal_dbm, local_ip.
    """
    info = {
        "type":       "unknown",
        "ssid":       None,
        "signal_pct": None,
        "signal_dbm": None,
        "local_ip":   get_local_ip(),
    }
    try:
        cmd = ["netsh", "wlan", "show", "interfaces"]
        result = subprocess.run(
            cmd, capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=5
        )
        output = result.stdout or ""
        signal_match = re.search(
            r"(?:Se[\xf1n]al|Signal)\s*:\s*(\d+)\s*%", output, re.IGNORECASE
        )
        if signal_match:
            pct = int(signal_match.group(1))
            ssid_match = re.search(
                r"^(?!.*BSSID)\s+SSID\s*:\s*(.+)$",
                output, re.IGNORECASE | re.MULTILINE
            )
            info["type"]       = "wifi"
            info["ssid"]       = ssid_match.group(1).strip() if ssid_match else None
            info["signal_pct"] = pct
            info["signal_dbm"] = signal_to_dbm(pct)
    except Exception as e:
        print(f"[Aviso] WiFi detection: {e}")
    return info


def get_security_type(auth, cipher):
    """Normaliza la etiqueta de seguridad."""
    auth_u = (auth or "").upper()
    cipher_u = (cipher or "").upper()

    if "OPEN" in auth_u or "ABIERTA" in auth_u:
        return "Abierta (Insegura)"
    elif "WPA3" in auth_u:
        return f"WPA3-Personal ({cipher_u})" if cipher_u else "WPA3"
    elif "WPA2" in auth_u:
        return f"WPA2-Personal ({cipher_u})" if cipher_u else "WPA2"
    elif "WPA" in auth_u:
        return f"WPA ({cipher_u})"
    elif "WEP" in cipher_u or "WEP" in auth_u:
        return "WEP (Obsoleto)"
    return f"{auth} - {cipher}".strip(" -") or "Desconocida"


def parse_netsh_output(raw_output):
    """
    Parsea la salida de `netsh wlan show networks mode=bssid`.
    Soporta sistemas operativos en Español e Inglés.
    """
    networks = []
    current_net = None
    current_bssid = None

    lines = raw_output.splitlines()

    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue

        # Detección de nuevo SSID: "SSID 1 : Nombre" o "SSID 1: Nombre"
        ssid_match = re.match(r"^SSID\s+\d+\s*:\s*(.*)$", line_str, re.IGNORECASE)
        if ssid_match:
            ssid_name = ssid_match.group(1).strip()
            if not ssid_name:
                ssid_name = "<Red Oculta>"
            current_net = {
                "ssid": ssid_name,
                "network_type": "Infraestructura",
                "authentication": "",
                "cipher": "",
                "bssids": []
            }
            networks.append(current_net)
            current_bssid = None
            continue

        if not current_net:
            continue

        # Tipo de red / Network type
        net_type_match = re.match(r"^(?:Tipo de red|Network type)\s*:\s*(.*)$", line_str, re.IGNORECASE)
        if net_type_match:
            current_net["network_type"] = net_type_match.group(1).strip()
            continue

        # Autenticación / Authentication
        auth_match = re.match(r"^(?:Autenticaci[oó]n|Authentication)\s*:\s*(.*)$", line_str, re.IGNORECASE)
        if auth_match:
            current_net["authentication"] = auth_match.group(1).strip()
            continue

        # Cifrado / Encryption
        cipher_match = re.match(r"^(?:Cifrado|Encryption)\s*:\s*(.*)$", line_str, re.IGNORECASE)
        if cipher_match:
            current_net["cipher"] = cipher_match.group(1).strip()
            continue

        # Detección de BSSID: "BSSID 1 : 00:11:22:33:44:55"
        bssid_match = re.match(r"^BSSID\s+\d+\s*:\s*([0-9a-fA-F:-]{17})", line_str, re.IGNORECASE)
        if bssid_match:
            current_bssid = {
                "bssid": bssid_match.group(1).upper().replace("-", ":"),
                "signal": 0,
                "dbm": -100,
                "radio_type": "802.11ac",
                "channel": 1,
                "band": "2.4 GHz"
            }
            current_net["bssids"].append(current_bssid)
            continue

        if not current_bssid:
            continue

        # Señal / Signal: "Señal : 85%" o "Signal : 85%"
        signal_match = re.match(r"^(?:Se[ñn]al|Signal)\s*:\s*(\d+)%", line_str, re.IGNORECASE)
        if signal_match:
            pct = int(signal_match.group(1))
            current_bssid["signal"] = pct
            current_bssid["dbm"] = signal_to_dbm(pct)
            continue

        # Tipo de radio / Radio type: "802.11ax", "802.11ac", etc.
        radio_match = re.match(r"^(?:Tipo de radio|Radio type)\s*:\s*(.*)$", line_str, re.IGNORECASE)
        if radio_match:
            current_bssid["radio_type"] = radio_match.group(1).strip()
            continue

        # Canal / Channel: "Canal : 6" o "Channel : 6"
        channel_match = re.match(r"^(?:Canal|Channel)\s*:\s*(\d+)", line_str, re.IGNORECASE)
        if channel_match:
            ch = int(channel_match.group(1))
            current_bssid["channel"] = ch
            current_bssid["band"] = calculate_band(ch)
            continue

    # Aplanar y enriquecer la lista para el frontend
    flat_list = []
    for net in networks:
        auth = net.get("authentication", "")
        cipher = net.get("cipher", "")
        sec_label = get_security_type(auth, cipher)
        is_open = "abierta" in sec_label.lower() or "open" in auth.lower()

        if not net["bssids"]:
            flat_list.append({
                "ssid": net["ssid"],
                "bssid": "N/A",
                "signal": 50,
                "dbm": signal_to_dbm(50),
                "radio_type": "802.11",
                "channel": 1,
                "band": "2.4 GHz",
                "security": sec_label,
                "authentication": auth,
                "cipher": cipher,
                "is_open": is_open
            })
        else:
            for b in net["bssids"]:
                flat_list.append({
                    "ssid": net["ssid"],
                    "bssid": b["bssid"],
                    "signal": b["signal"],
                    "dbm": b["dbm"],
                    "radio_type": b["radio_type"],
                    "channel": b["channel"],
                    "band": b["band"],
                    "security": sec_label,
                    "authentication": auth,
                    "cipher": cipher,
                    "is_open": is_open
                })

    flat_list.sort(key=lambda x: x["signal"], reverse=True)
    return flat_list


def get_mock_wifi_data():
    """Genera datos de demostración realistas en caso de que Windows requiera permisos de ubicación."""
    return [
        {
            "ssid": "WIN_Fibra_Optica_5G",
            "bssid": "3C:84:6A:12:34:56",
            "signal": 96,
            "dbm": -52,
            "radio_type": "802.11ax (Wi-Fi 6)",
            "channel": 36,
            "band": "5 GHz",
            "security": "WPA3-Personal (CCMP)",
            "authentication": "WPA3-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "WIN_Fibra_Optica_2.4G",
            "bssid": "3C:84:6A:12:34:57",
            "signal": 88,
            "dbm": -56,
            "radio_type": "802.11ax (Wi-Fi 6)",
            "channel": 6,
            "band": "2.4 GHz",
            "security": "WPA2-Personal (AES)",
            "authentication": "WPA2-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "TotalPlay_Wifi_Plus",
            "bssid": "18:82:8C:77:99:A1",
            "signal": 74,
            "dbm": -63,
            "radio_type": "802.11ac (Wi-Fi 5)",
            "channel": 44,
            "band": "5 GHz",
            "security": "WPA2-Personal (AES)",
            "authentication": "WPA2-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "TotalPlay_Wifi_2.4",
            "bssid": "18:82:8C:77:99:A2",
            "signal": 68,
            "dbm": -66,
            "radio_type": "802.11n",
            "channel": 1,
            "band": "2.4 GHz",
            "security": "WPA2-Personal (AES)",
            "authentication": "WPA2-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "Claro_Hogar_DualBand",
            "bssid": "E4:AA:5D:89:BC:10",
            "signal": 62,
            "dbm": -69,
            "radio_type": "802.11ac",
            "channel": 149,
            "band": "5 GHz",
            "security": "WPA2-Personal",
            "authentication": "WPA2-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "Movistar_Fibra_5Ghz",
            "bssid": "50:C7:BF:33:22:11",
            "signal": 55,
            "dbm": -72,
            "radio_type": "802.11ac",
            "channel": 48,
            "band": "5 GHz",
            "security": "WPA2-Personal",
            "authentication": "WPA2-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "Starbucks_Guest_WiFi",
            "bssid": "00:26:86:14:8A:2C",
            "signal": 45,
            "dbm": -77,
            "radio_type": "802.11g/n",
            "channel": 11,
            "band": "2.4 GHz",
            "security": "Abierta (Insegura)",
            "authentication": "Abierta",
            "cipher": "Ninguno",
            "is_open": True
        },
        {
            "ssid": "Vecino_TP-Link_2.4G",
            "bssid": "C0:06:C3:44:55:66",
            "signal": 38,
            "dbm": -81,
            "radio_type": "802.11n",
            "channel": 6,
            "band": "2.4 GHz",
            "security": "WPA2-Personal",
            "authentication": "WPA2-Personal",
            "cipher": "CCMP",
            "is_open": False
        },
        {
            "ssid": "DIRECTV_Internet_Mobile",
            "bssid": "94:83:C4:01:23:45",
            "signal": 30,
            "dbm": -85,
            "radio_type": "802.11n",
            "channel": 1,
            "band": "2.4 GHz",
            "security": "WPA2-Personal",
            "authentication": "WPA2-Personal",
            "cipher": "TKIP",
            "is_open": False
        }
    ]


def perform_wifi_scan():
    """
    Ejecuta el escaneo Wi-Fi nativo en Windows mediante netsh.
    Detecta si se requiere habilitar ubicación o elevación de permisos.
    """
    response_data = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "networks": [],
        "count": 0,
        "adapter": get_wifi_adapter_info(),
        "is_simulated": False,
        "permission_needed": False,
        "elevation_needed": False,
        "raw_message": ""
    }

    try:
        cmd = ["netsh", "wlan", "show", "networks", "mode=bssid"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=8
        )
        output = (result.stdout or "") + "\n" + (result.stderr or "")

        needs_loc = ("permiso de ubicaci" in output.lower() or 
                     "location" in output.lower() or 
                     "ms-settings:privacy-location" in output.lower())
        needs_elev = ("requiere elevaci" in output.lower() or 
                      "elevation" in output.lower() or 
                      "error 5" in output.lower())

        if needs_loc or needs_elev or result.returncode != 0:
            response_data["permission_needed"] = needs_loc
            response_data["elevation_needed"] = needs_elev
            response_data["raw_message"] = output.strip()
            mock_data = get_mock_wifi_data()
            response_data["networks"] = mock_data
            response_data["count"] = len(mock_data)
            response_data["is_simulated"] = True
            return response_data

        parsed_networks = parse_netsh_output(result.stdout)
        if not parsed_networks:
            response_data["networks"] = get_mock_wifi_data()
            response_data["count"] = len(response_data["networks"])
            response_data["is_simulated"] = True
        else:
            response_data["networks"] = parsed_networks
            response_data["count"] = len(parsed_networks)
            response_data["is_simulated"] = False

    except Exception as e:
        response_data["raw_message"] = str(e)
        response_data["networks"] = get_mock_wifi_data()
        response_data["count"] = len(response_data["networks"])
        response_data["is_simulated"] = True

    return response_data


class WiFiScannerHandler(http.server.SimpleHTTPRequestHandler):
    """Manejador HTTP para la API REST y los archivos estáticos."""

    def do_POST(self):
        """Maneja peticiones POST. Actualmente: /api/speedtest-upload para medir subida."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        if path == "/api/speedtest-upload":
            # Leer y descartar el cuerpo — solo necesitamos el tiempo
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 0:
                self.rfile.read(content_length)
            response = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(response)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response)
            return

        self.send_error(404, f"POST no soportado: {path}")

    def end_headers(self):
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
            self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # Servir templates/paginaWin.html como página principal (raíz)
        if path == "/" or path == "/paginaWin.html" or path == "/paginaWin":
            win_file = os.path.join(TEMPLATES_DIR, "paginaWin.html")
            if os.path.exists(win_file):
                with open(win_file, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                self.send_error(404, "templates/paginaWin.html no encontrado")
                return

        # Servir templates/index.html (Escáner Wi-Fi) al redirigir
        if path == "/index.html" or path == "/index" or path == "/scanner":
            index_file = os.path.join(TEMPLATES_DIR, "index.html")
            if os.path.exists(index_file):
                with open(index_file, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                self.send_error(404, "templates/index.html no encontrado")
                return

        # Servir estáticos (/static/...)
        if path.startswith("/static/"):
            rel_path = path[len("/static/"):].lstrip("/")
            full_path = os.path.join(STATIC_DIR, rel_path)
            
            if not os.path.abspath(full_path).startswith(STATIC_DIR):
                self.send_error(403, "Acceso denegado")
                return

            if os.path.exists(full_path) and os.path.isfile(full_path):
                content_type = "application/octet-stream"
                if full_path.endswith(".css"):
                    content_type = "text/css; charset=utf-8"
                elif full_path.endswith(".js"):
                    content_type = "application/javascript; charset=utf-8"
                elif full_path.endswith(".svg"):
                    content_type = "image/svg+xml"
                elif full_path.endswith(".png"):
                    content_type = "image/png"
                elif full_path.endswith(".ico"):
                    content_type = "image/x-icon"
                elif full_path.endswith(".json"):
                    content_type = "application/json"

                with open(full_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            else:
                self.send_error(404, f"Archivo no encontrado: {path}")
                return

        # API: /api/speedtest  — sirve 2 MB de ceros para medir descarga real
        if path == "/api/speedtest":
            SIZE = 2 * 1024 * 1024  # 2 MB
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(SIZE))
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b"\x00" * SIZE)
            return

        # API: /api/ping — endpoint ultrarrápido para medir latencia y jitter Wi-Fi local
        if path == "/api/ping":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
            return

        # API: /api/signal — detecta tipo de conexión activa y sus métricas
        if path == "/api/signal":
            conn_info = get_connection_info()
            json_bytes = json.dumps(conn_info, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(json_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json_bytes)
            return

        # API: /api/scan
        if path == "/api/scan":
            data = perform_wifi_scan()
            json_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(json_bytes)))
            self.end_headers()
            self.wfile.write(json_bytes)
            return

        # API: /api/adapter
        if path == "/api/adapter":
            adapter_info = get_wifi_adapter_info()
            json_bytes = json.dumps(adapter_info, ensure_ascii=False, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(json_bytes)))
            self.end_headers()
            self.wfile.write(json_bytes)
            return

        # API: /api/diagnose
        if path == "/api/diagnose":
            res = {
                "service": "WIN Fibra Óptica 100%",
                "status": "online",
                "features": ["mapeo_ambientes", "simulador_radar", "diagnostico_mesh"],
                "recommended_mesh": "WIN Mesh Wi-Fi 6"
            }
            json_bytes = json.dumps(res, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(json_bytes)))
            self.end_headers()
            self.wfile.write(json_bytes)
            return

        self.send_error(404, f"Ruta no encontrada: {path}")


def find_available_port(preferred_port=PORT):
    """Busca el puerto preferido o el siguiente disponible."""
    import socket
    test_ports = [preferred_port, 5005, 5001, 8080, 8000, 3000]
    for p in test_ports:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(("", p))
                return p
        except OSError:
            continue
    return preferred_port


def run_server(port=None):
    """Inicia el servidor web multihilo."""
    import webbrowser
    actual_port = port if port else find_available_port(PORT)
    server_class = http.server.ThreadingHTTPServer
    server_address = ("", actual_port)
    try:
        httpd = server_class(server_address, WiFiScannerHandler)
    except OSError as e:
        actual_port = find_available_port(actual_port + 1)
        server_address = ("", actual_port)
        httpd = server_class(server_address, WiFiScannerHandler)

    local_ip = get_local_ip()
    local_url = f"http://localhost:{actual_port}"
    mobile_url = f"http://{local_ip}:{actual_port}"
    print("=" * 66)
    print("  [*] WIN Wi-Fi Scanner Web - Servidor Activo")
    print(f"  [+] URL en esta PC:   {local_url}")
    print(f"  [+] URL para Celular: {mobile_url}  (conectado al Wi-Fi de tu casa)")
    print(f"  [+] API Endpoint:     {local_url}/api/scan")
    print("  [*] Presiona Ctrl+C para detener el servidor")
    print("=" * 66)

    # Intentar abrir automáticamente el navegador después de 0.5s
    try:
        import threading
        threading.Timer(0.5, lambda: webbrowser.open(local_url)).start()
    except Exception:
        pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido por el usuario.")
        httpd.server_close()


if __name__ == "__main__":
    port_arg = None
    if len(sys.argv) > 1:
        try:
            port_arg = int(sys.argv[1])
        except ValueError:
            pass
    run_server(port_arg)
