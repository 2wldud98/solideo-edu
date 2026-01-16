/**
 * 시스템 리소스 모니터 - 메인 JavaScript
 * WebSocket 실시간 데이터 및 Chart.js 시각화
 */

// 전역 변수
let ws = null;
let charts = {};
let gauges = {};
let historyData = { cpu: [], memory: [], network: { upload: [], download: [] } };
const MAX_HISTORY = 60;

// 녹화 관련
let isRecording = false;
let recordingData = [];
let recordingStartTime = null;
let recordingTimer = null;
const RECORDING_DURATION = 5 * 60 * 1000; // 5분

// DOM 로드 완료시 초기화
document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    initGauges();
    connectWebSocket();
    updateTime();
    setInterval(updateTime, 1000);

    // 버튼 이벤트
    document.getElementById('startRecordingBtn').addEventListener('click', toggleRecording);
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadPDF);
});

// 시간 업데이트
function updateTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString('ko-KR');
}

// WebSocket 연결
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        updateConnectionStatus('connected');
    };

    ws.onclose = () => {
        updateConnectionStatus('disconnected');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = () => {
        updateConnectionStatus('disconnected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        updateDashboard(data);

        if (isRecording) {
            recordingData.push(data);
        }
    };
}

function updateConnectionStatus(status) {
    const dot = document.querySelector('.status-dot');
    const text = document.querySelector('.status-text');

    dot.className = 'status-dot ' + status;
    text.textContent = status === 'connected' ? '연결됨' : '연결 끊김';
}

// 차트 초기화
function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        scales: {
            x: { display: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.5)', maxTicksLimit: 10 } },
            y: { display: true, min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: 'rgba(255,255,255,0.5)' } }
        },
        plugins: { legend: { display: false } }
    };

    // CPU 차트
    charts.cpu = new Chart(document.getElementById('cpuChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'CPU %',
                data: [],
                borderColor: '#4facfe',
                backgroundColor: 'rgba(79, 172, 254, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: chartOptions
    });

    // 메모리 차트
    charts.memory = new Chart(document.getElementById('memoryChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Memory %',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: chartOptions
    });

    // 네트워크 차트
    const netOptions = { ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, max: undefined } } };
    charts.network = new Chart(document.getElementById('networkChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                { label: '업로드', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true, tension: 0.4, pointRadius: 0 },
                { label: '다운로드', data: [], borderColor: '#4facfe', backgroundColor: 'rgba(79, 172, 254, 0.1)', fill: true, tension: 0.4, pointRadius: 0 }
            ]
        },
        options: { ...netOptions, plugins: { legend: { display: true, labels: { color: 'rgba(255,255,255,0.7)' } } } }
    });
}

// 게이지 초기화
function initGauges() {
    const gaugeOptions = (color) => ({
        type: 'doughnut',
        data: {
            datasets: [{
                data: [0, 100],
                backgroundColor: [color, 'rgba(255,255,255,0.1)'],
                borderWidth: 0,
                cutout: '80%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            animation: { duration: 300 },
            plugins: { tooltip: { enabled: false } }
        }
    });

    gauges.cpu = new Chart(document.getElementById('cpuGauge'), gaugeOptions('#4facfe'));
    gauges.memory = new Chart(document.getElementById('memoryGauge'), gaugeOptions('#10b981'));
    gauges.disk = new Chart(document.getElementById('diskGauge'), gaugeOptions('#22d3ee'));
}

// 대시보드 업데이트
function updateDashboard(data) {
    updateSystemInfo(data.system);
    updateCPU(data.cpu);
    updateMemory(data.memory);
    updateDisk(data.disk);
    updateNetwork(data.network);
    updateGPU(data.gpu);
    updateProcesses(data.processes);
    updateCharts(data);
}

function updateSystemInfo(system) {
    if (!system) return;
    document.getElementById('hostname').textContent = system.hostname || '-';
    document.getElementById('platform').textContent = `${system.platform} ${system.platform_release}`;
    document.getElementById('processor').textContent = system.processor || '-';

    const uptime = system.uptime_seconds;
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    document.getElementById('uptime').textContent = `${hours}시간 ${mins}분`;
}

function updateCPU(cpu) {
    if (!cpu) return;
    const percent = cpu.percent;

    document.getElementById('cpuPercent').textContent = percent.toFixed(1);
    document.getElementById('cpuFreq').textContent = `${cpu.frequency.current.toFixed(0)} MHz`;
    document.getElementById('cpuCores').textContent = `${cpu.cores.physical}C / ${cpu.cores.logical}T`;

    gauges.cpu.data.datasets[0].data = [percent, 100 - percent];
    gauges.cpu.update();

    // 코어별 업데이트
    const coresGrid = document.getElementById('coresGrid');
    if (cpu.percent_per_core && cpu.percent_per_core.length > 0) {
        let html = '';
        cpu.percent_per_core.forEach((p, i) => {
            html += `<div class="core-item"><span class="core-label">Core ${i}</span><div class="core-bar"><div class="core-fill" style="height:${p}%"></div></div><span class="core-value">${p.toFixed(0)}%</span></div>`;
        });
        coresGrid.innerHTML = html;
    }
}

function updateMemory(memory) {
    if (!memory || !memory.virtual) return;
    const v = memory.virtual;

    document.getElementById('memoryPercent').textContent = v.percent.toFixed(1);
    document.getElementById('memoryUsed').textContent = `${v.used_gb} GB`;
    document.getElementById('memoryTotal').textContent = `${v.total_gb} GB`;

    gauges.memory.data.datasets[0].data = [v.percent, 100 - v.percent];
    gauges.memory.update();
}

function updateDisk(disk) {
    if (!disk || !disk.partitions || disk.partitions.length === 0) return;

    const mainDisk = disk.partitions[0];
    document.getElementById('diskPercent').textContent = mainDisk.percent.toFixed(1);
    document.getElementById('diskUsed').textContent = `${mainDisk.used_gb} GB`;
    document.getElementById('diskTotal').textContent = `${mainDisk.total_gb} GB`;

    gauges.disk.data.datasets[0].data = [mainDisk.percent, 100 - mainDisk.percent];
    gauges.disk.update();

    // 파티션별 업데이트
    const grid = document.getElementById('partitionsGrid');
    let html = '';
    disk.partitions.forEach(p => {
        const fillClass = p.percent > 90 ? 'danger' : p.percent > 70 ? 'warning' : '';
        html += `<div class="partition-item"><div class="partition-header"><span class="partition-name">${p.mountpoint}</span><span class="partition-percent">${p.percent.toFixed(1)}%</span></div><div class="partition-bar"><div class="partition-fill ${fillClass}" style="width:${p.percent}%"></div></div><div class="partition-details"><span>사용: ${p.used_gb} GB</span><span>여유: ${p.free_gb} GB</span></div></div>`;
    });
    grid.innerHTML = html;
}

function updateNetwork(network) {
    if (!network) return;

    const speed = network.speed || { upload_bytes_per_sec: 0, download_bytes_per_sec: 0 };
    const io = network.io || { bytes_sent_mb: 0, bytes_recv_mb: 0 };

    document.getElementById('netUpload').textContent = (speed.upload_bytes_per_sec / 1024).toFixed(1);
    document.getElementById('netDownload').textContent = (speed.download_bytes_per_sec / 1024).toFixed(1);
    document.getElementById('netSent').textContent = `${io.bytes_sent_mb} MB`;
    document.getElementById('netRecv').textContent = `${io.bytes_recv_mb} MB`;
}

function updateGPU(gpu) {
    const section = document.getElementById('gpuSection');
    const grid = document.getElementById('gpuGrid');

    if (!gpu || !gpu.available || !gpu.gpus || gpu.gpus.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    let html = '';
    gpu.gpus.forEach(g => {
        html += `<div class="gpu-card"><div class="gpu-name">🎮 ${g.name}</div><div class="gpu-stats"><div class="gpu-stat"><span class="label">사용률</span><span class="value">${g.load.toFixed(1)}%</span></div><div class="gpu-stat"><span class="label">온도</span><span class="value">${g.temperature}°C</span></div><div class="gpu-stat"><span class="label">메모리</span><span class="value">${g.memory_used}/${g.memory_total} MB</span></div><div class="gpu-stat"><span class="label">메모리 %</span><span class="value">${g.memory_percent.toFixed(1)}%</span></div></div></div>`;
    });
    grid.innerHTML = html;
}

function updateProcesses(processes) {
    if (!processes) return;
    const tbody = document.getElementById('processTableBody');
    let html = '';
    processes.forEach(p => {
        const statusClass = p.status === 'running' ? 'running' : 'sleeping';
        html += `<tr><td>${p.pid}</td><td class="process-name">${p.name}</td><td>${p.cpu_percent.toFixed(1)}%</td><td>${p.memory_percent.toFixed(1)}%</td><td><span class="process-status ${statusClass}">${p.status}</span></td></tr>`;
    });
    tbody.innerHTML = html;
}

function updateCharts(data) {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // CPU 히스토리
    historyData.cpu.push(data.cpu?.percent || 0);
    if (historyData.cpu.length > MAX_HISTORY) historyData.cpu.shift();

    charts.cpu.data.labels = historyData.cpu.map((_, i) => '');
    charts.cpu.data.datasets[0].data = historyData.cpu;
    charts.cpu.update('none');

    // 메모리 히스토리
    historyData.memory.push(data.memory?.virtual?.percent || 0);
    if (historyData.memory.length > MAX_HISTORY) historyData.memory.shift();

    charts.memory.data.labels = historyData.memory.map((_, i) => '');
    charts.memory.data.datasets[0].data = historyData.memory;
    charts.memory.update('none');

    // 네트워크 히스토리
    const up = (data.network?.speed?.upload_bytes_per_sec || 0) / 1024;
    const down = (data.network?.speed?.download_bytes_per_sec || 0) / 1024;
    historyData.network.upload.push(up);
    historyData.network.download.push(down);
    if (historyData.network.upload.length > MAX_HISTORY) {
        historyData.network.upload.shift();
        historyData.network.download.shift();
    }

    charts.network.data.labels = historyData.network.upload.map((_, i) => '');
    charts.network.data.datasets[0].data = historyData.network.upload;
    charts.network.data.datasets[1].data = historyData.network.download;
    charts.network.update('none');
}

// 녹화 기능
function toggleRecording() {
    const btn = document.getElementById('startRecordingBtn');

    if (!isRecording) {
        startRecording();
        btn.innerHTML = '<span class="btn-icon">⏹</span><span class="btn-text">녹화 중지</span>';
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-danger');
    } else {
        stopRecording();
        btn.innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">5분 녹화 시작</span>';
        btn.classList.remove('btn-danger');
        btn.classList.add('btn-primary');
    }
}

function startRecording() {
    isRecording = true;
    recordingData = [];
    recordingStartTime = Date.now();

    document.getElementById('recordingDot').classList.add('active');
    document.getElementById('recordingText').textContent = '녹화 중...';
    document.getElementById('downloadPdfBtn').disabled = true;

    recordingTimer = setInterval(updateRecordingTime, 1000);

    // 5분 후 자동 중지
    setTimeout(() => {
        if (isRecording) {
            stopRecording();
            document.getElementById('startRecordingBtn').innerHTML = '<span class="btn-icon">▶</span><span class="btn-text">5분 녹화 시작</span>';
            document.getElementById('startRecordingBtn').classList.remove('btn-danger');
            document.getElementById('startRecordingBtn').classList.add('btn-primary');
        }
    }, RECORDING_DURATION);
}

function stopRecording() {
    isRecording = false;
    clearInterval(recordingTimer);

    document.getElementById('recordingDot').classList.remove('active');
    document.getElementById('recordingText').textContent = '녹화 완료';
    document.getElementById('downloadPdfBtn').disabled = false;
}

function updateRecordingTime() {
    const elapsed = Date.now() - recordingStartTime;
    const total = RECORDING_DURATION;

    const elapsedMins = Math.floor(elapsed / 60000);
    const elapsedSecs = Math.floor((elapsed % 60000) / 1000);
    const totalMins = Math.floor(total / 60000);
    const totalSecs = Math.floor((total % 60000) / 1000);

    document.getElementById('recordingTime').textContent =
        `${String(elapsedMins).padStart(2, '0')}:${String(elapsedSecs).padStart(2, '0')} / ${String(totalMins).padStart(2, '0')}:${String(totalSecs).padStart(2, '0')}`;
}

// PDF 다운로드
async function downloadPDF() {
    if (recordingData.length === 0) {
        alert('녹화된 데이터가 없습니다.');
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 20;

    // 제목
    pdf.setFontSize(20);
    pdf.setTextColor(79, 172, 254);
    pdf.text('System Resource Monitor Report', pageWidth / 2, y, { align: 'center' });
    y += 15;

    // 날짜
    pdf.setFontSize(10);
    pdf.setTextColor(100);
    const now = new Date();
    pdf.text(`Generated: ${now.toLocaleString('ko-KR')}`, pageWidth / 2, y, { align: 'center' });
    pdf.text(`Recording Duration: ${Math.floor(recordingData.length)} seconds`, pageWidth / 2, y + 5, { align: 'center' });
    y += 20;

    // 시스템 정보
    const sysInfo = recordingData[0]?.system;
    if (sysInfo) {
        pdf.setFontSize(14);
        pdf.setTextColor(0);
        pdf.text('System Information', 20, y);
        y += 8;

        pdf.setFontSize(10);
        pdf.setTextColor(60);
        pdf.text(`Hostname: ${sysInfo.hostname}`, 25, y); y += 5;
        pdf.text(`Platform: ${sysInfo.platform} ${sysInfo.platform_release}`, 25, y); y += 5;
        pdf.text(`Processor: ${sysInfo.processor}`, 25, y); y += 15;
    }

    // 통계 계산
    const stats = calculateStats();

    // CPU 통계
    pdf.setFontSize(14);
    pdf.setTextColor(0);
    pdf.text('CPU Statistics', 20, y);
    y += 8;

    pdf.setFontSize(10);
    pdf.setTextColor(60);
    pdf.text(`Average: ${stats.cpu.avg.toFixed(1)}%`, 25, y);
    pdf.text(`Min: ${stats.cpu.min.toFixed(1)}%`, 75, y);
    pdf.text(`Max: ${stats.cpu.max.toFixed(1)}%`, 120, y);
    y += 15;

    // 메모리 통계
    pdf.setFontSize(14);
    pdf.setTextColor(0);
    pdf.text('Memory Statistics', 20, y);
    y += 8;

    pdf.setFontSize(10);
    pdf.setTextColor(60);
    pdf.text(`Average: ${stats.memory.avg.toFixed(1)}%`, 25, y);
    pdf.text(`Min: ${stats.memory.min.toFixed(1)}%`, 75, y);
    pdf.text(`Max: ${stats.memory.max.toFixed(1)}%`, 120, y);
    y += 15;

    // 네트워크 통계
    pdf.setFontSize(14);
    pdf.setTextColor(0);
    pdf.text('Network Statistics', 20, y);
    y += 8;

    pdf.setFontSize(10);
    pdf.setTextColor(60);
    pdf.text(`Upload Avg: ${stats.network.uploadAvg.toFixed(2)} KB/s`, 25, y);
    pdf.text(`Download Avg: ${stats.network.downloadAvg.toFixed(2)} KB/s`, 100, y);
    y += 15;

    // 차트 캡처
    try {
        const dashboard = document.querySelector('.dashboard');
        const canvas = await html2canvas(dashboard, {
            backgroundColor: '#0f0f1a',
            scale: 1.5,
            logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        const imgWidth = pageWidth - 40;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // 새 페이지 추가
        pdf.addPage();
        pdf.setFontSize(14);
        pdf.setTextColor(0);
        pdf.text('Dashboard Snapshot', 20, 20);

        pdf.addImage(imgData, 'PNG', 20, 30, imgWidth, Math.min(imgHeight, pageHeight - 50));
    } catch (e) {
        console.error('Chart capture failed:', e);
    }

    // 다운로드
    pdf.save(`system_monitor_report_${now.toISOString().slice(0, 10)}.pdf`);
}

function calculateStats() {
    const cpuValues = recordingData.map(d => d.cpu?.percent || 0);
    const memValues = recordingData.map(d => d.memory?.virtual?.percent || 0);
    const upValues = recordingData.map(d => (d.network?.speed?.upload_bytes_per_sec || 0) / 1024);
    const downValues = recordingData.map(d => (d.network?.speed?.download_bytes_per_sec || 0) / 1024);

    const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

    return {
        cpu: { avg: avg(cpuValues), min: Math.min(...cpuValues), max: Math.max(...cpuValues) },
        memory: { avg: avg(memValues), min: Math.min(...memValues), max: Math.max(...memValues) },
        network: { uploadAvg: avg(upValues), downloadAvg: avg(downValues) }
    };
}
