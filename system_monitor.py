"""
시스템 리소스 모니터링 모듈
CPU, 메모리, 디스크, 네트워크, GPU 정보를 수집합니다.
"""

import psutil
import platform
from datetime import datetime
from typing import Dict, Any, List, Optional

# GPU 모니터링 (NVIDIA GPU가 있는 경우에만 작동)
try:
    import GPUtil
    GPU_AVAILABLE = True
except ImportError:
    GPU_AVAILABLE = False

# Windows WMI (온도 정보)
try:
    import wmi
    import pythoncom
    WMI_AVAILABLE = True
except ImportError:
    WMI_AVAILABLE = False


def get_cpu_info() -> Dict[str, Any]:
    """CPU 정보 수집"""
    cpu_percent = psutil.cpu_percent(interval=0.1)
    cpu_percent_per_core = psutil.cpu_percent(interval=0.1, percpu=True)
    cpu_freq = psutil.cpu_freq()
    cpu_count = psutil.cpu_count(logical=True)
    cpu_count_physical = psutil.cpu_count(logical=False)
    
    return {
        "percent": cpu_percent,
        "percent_per_core": cpu_percent_per_core,
        "frequency": {
            "current": cpu_freq.current if cpu_freq else 0,
            "min": cpu_freq.min if cpu_freq else 0,
            "max": cpu_freq.max if cpu_freq else 0
        },
        "cores": {
            "logical": cpu_count,
            "physical": cpu_count_physical
        }
    }


def get_memory_info() -> Dict[str, Any]:
    """메모리 정보 수집"""
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    
    return {
        "virtual": {
            "total": mem.total,
            "available": mem.available,
            "used": mem.used,
            "percent": mem.percent,
            "total_gb": round(mem.total / (1024**3), 2),
            "used_gb": round(mem.used / (1024**3), 2),
            "available_gb": round(mem.available / (1024**3), 2)
        },
        "swap": {
            "total": swap.total,
            "used": swap.used,
            "free": swap.free,
            "percent": swap.percent,
            "total_gb": round(swap.total / (1024**3), 2),
            "used_gb": round(swap.used / (1024**3), 2)
        }
    }


def get_disk_info() -> Dict[str, Any]:
    """디스크 정보 수집"""
    partitions = []
    
    for partition in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            partitions.append({
                "device": partition.device,
                "mountpoint": partition.mountpoint,
                "fstype": partition.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
                "total_gb": round(usage.total / (1024**3), 2),
                "used_gb": round(usage.used / (1024**3), 2),
                "free_gb": round(usage.free / (1024**3), 2)
            })
        except PermissionError:
            continue
    
    # 디스크 I/O
    io_counters = psutil.disk_io_counters()
    io_info = {}
    if io_counters:
        io_info = {
            "read_bytes": io_counters.read_bytes,
            "write_bytes": io_counters.write_bytes,
            "read_count": io_counters.read_count,
            "write_count": io_counters.write_count,
            "read_mb": round(io_counters.read_bytes / (1024**2), 2),
            "write_mb": round(io_counters.write_bytes / (1024**2), 2)
        }
    
    return {
        "partitions": partitions,
        "io": io_info
    }


# 이전 네트워크 통계 저장 (속도 계산용)
_prev_net_io = None
_prev_net_time = None


def get_network_info() -> Dict[str, Any]:
    """네트워크 정보 수집"""
    global _prev_net_io, _prev_net_time
    
    net_io = psutil.net_io_counters()
    current_time = datetime.now().timestamp()
    
    # 속도 계산
    bytes_sent_speed = 0
    bytes_recv_speed = 0
    
    if _prev_net_io and _prev_net_time:
        time_diff = current_time - _prev_net_time
        if time_diff > 0:
            bytes_sent_speed = (net_io.bytes_sent - _prev_net_io.bytes_sent) / time_diff
            bytes_recv_speed = (net_io.bytes_recv - _prev_net_io.bytes_recv) / time_diff
    
    _prev_net_io = net_io
    _prev_net_time = current_time
    
    # 네트워크 인터페이스별 정보
    interfaces = {}
    net_if_addrs = psutil.net_if_addrs()
    net_if_stats = psutil.net_if_stats()
    
    for interface, addrs in net_if_addrs.items():
        if interface in net_if_stats:
            stats = net_if_stats[interface]
            interfaces[interface] = {
                "is_up": stats.isup,
                "speed": stats.speed,
                "addresses": [
                    {"family": str(addr.family), "address": addr.address}
                    for addr in addrs
                ]
            }
    
    return {
        "io": {
            "bytes_sent": net_io.bytes_sent,
            "bytes_recv": net_io.bytes_recv,
            "packets_sent": net_io.packets_sent,
            "packets_recv": net_io.packets_recv,
            "bytes_sent_mb": round(net_io.bytes_sent / (1024**2), 2),
            "bytes_recv_mb": round(net_io.bytes_recv / (1024**2), 2)
        },
        "speed": {
            "upload_bytes_per_sec": round(bytes_sent_speed, 2),
            "download_bytes_per_sec": round(bytes_recv_speed, 2),
            "upload_mbps": round(bytes_sent_speed * 8 / (1024**2), 2),
            "download_mbps": round(bytes_recv_speed * 8 / (1024**2), 2)
        },
        "interfaces": interfaces
    }


def get_gpu_info() -> Dict[str, Any]:
    """GPU 정보 수집 (NVIDIA GPU만 지원)"""
    if not GPU_AVAILABLE:
        return {"available": False, "gpus": []}
    
    try:
        gpus = GPUtil.getGPUs()
        gpu_list = []
        
        for gpu in gpus:
            gpu_list.append({
                "id": gpu.id,
                "name": gpu.name,
                "load": round(gpu.load * 100, 1),
                "memory_total": gpu.memoryTotal,
                "memory_used": gpu.memoryUsed,
                "memory_free": gpu.memoryFree,
                "memory_percent": round((gpu.memoryUsed / gpu.memoryTotal) * 100, 1) if gpu.memoryTotal > 0 else 0,
                "temperature": gpu.temperature,
                "driver": gpu.driver
            })
        
        return {"available": True, "gpus": gpu_list}
    except Exception as e:
        return {"available": False, "error": str(e), "gpus": []}


def get_temperature_info() -> Dict[str, Any]:
    """온도 정보 수집"""
    temps = {}
    
    # psutil의 sensors_temperatures (Linux에서만 작동)
    if hasattr(psutil, 'sensors_temperatures'):
        try:
            temp_sensors = psutil.sensors_temperatures()
            for name, entries in temp_sensors.items():
                temps[name] = [
                    {
                        "label": entry.label or name,
                        "current": entry.current,
                        "high": entry.high,
                        "critical": entry.critical
                    }
                    for entry in entries
                ]
        except Exception:
            pass
    
    # Windows WMI를 통한 온도 정보
    if WMI_AVAILABLE and platform.system() == "Windows":
        try:
            pythoncom.CoInitialize()
            w = wmi.WMI(namespace="root\\wmi")
            temperature_info = w.MSAcpi_ThermalZoneTemperature()
            for temp in temperature_info:
                # Kelvin to Celsius
                celsius = (temp.CurrentTemperature / 10) - 273.15
                temps["thermal_zone"] = [{
                    "label": "CPU",
                    "current": round(celsius, 1),
                    "high": None,
                    "critical": None
                }]
        except Exception:
            pass
    
    return {"sensors": temps, "available": len(temps) > 0}


def get_system_info() -> Dict[str, Any]:
    """시스템 기본 정보"""
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    
    return {
        "platform": platform.system(),
        "platform_release": platform.release(),
        "platform_version": platform.version(),
        "architecture": platform.machine(),
        "hostname": platform.node(),
        "processor": platform.processor(),
        "boot_time": boot_time.isoformat(),
        "uptime_seconds": (datetime.now() - boot_time).total_seconds()
    }


def get_process_info(top_n: int = 10) -> List[Dict[str, Any]]:
    """상위 프로세스 정보 (CPU 사용량 기준)"""
    processes = []
    
    for proc in psutil.process_iter(['pid', 'name', 'cpu_percent', 'memory_percent', 'status']):
        try:
            info = proc.info
            processes.append({
                "pid": info['pid'],
                "name": info['name'],
                "cpu_percent": info['cpu_percent'] or 0,
                "memory_percent": round(info['memory_percent'] or 0, 2),
                "status": info['status']
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    # CPU 사용량 기준 정렬
    processes.sort(key=lambda x: x['cpu_percent'], reverse=True)
    return processes[:top_n]


def get_all_metrics() -> Dict[str, Any]:
    """모든 시스템 메트릭 수집"""
    return {
        "timestamp": datetime.now().isoformat(),
        "system": get_system_info(),
        "cpu": get_cpu_info(),
        "memory": get_memory_info(),
        "disk": get_disk_info(),
        "network": get_network_info(),
        "gpu": get_gpu_info(),
        "temperature": get_temperature_info(),
        "processes": get_process_info()
    }


if __name__ == "__main__":
    import json
    metrics = get_all_metrics()
    print(json.dumps(metrics, indent=2, ensure_ascii=False))
