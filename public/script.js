let qrcodeInstance = null;

async function fetchStats() {
    try {
        const response = await fetch('/api/stats');
        const data = await response.json();

        // Update Connection Status
        const statusBadge = document.getElementById('status-badge');
        if (data.status === 'ready') {
            statusBadge.className = 'status online';
            statusBadge.textContent = 'Connected to WhatsApp';
            document.getElementById('qr-container').classList.add('hidden');
        } else if (data.status === 'qr') {
            statusBadge.className = 'status offline';
            statusBadge.textContent = 'Waiting for QR Scan';
            
            // Show QR Code
            document.getElementById('qr-container').classList.remove('hidden');
            if (!qrcodeInstance && data.qrCode) {
                qrcodeInstance = new QRCode(document.getElementById("qrcode"), {
                    text: data.qrCode,
                    width: 256,
                    height: 256,
                    colorDark : "#000000",
                    colorLight : "#ffffff",
                    correctLevel : QRCode.CorrectLevel.H
                });
            }
        } else {
            statusBadge.className = 'status offline';
            statusBadge.textContent = 'Connecting...';
        }

        // Update Numbers
        document.getElementById('total-leads').textContent = data.totalLeads;
        document.getElementById('sent-dms').textContent = data.sentDms;
        document.getElementById('pending-dms').textContent = data.pendingDms;
        document.getElementById('variant-a').textContent = data.variantA;
        document.getElementById('variant-b').textContent = data.variantB;

        // Update Table
        const tbody = document.getElementById('activity-table');
        tbody.innerHTML = '';
        
        if (data.recentActivity && data.recentActivity.length > 0) {
            data.recentActivity.forEach(activity => {
                const tr = document.createElement('tr');
                
                const timeStr = new Date(activity.sentAt).toLocaleString();
                
                tr.innerHTML = `
                    <td>
                        <strong>${activity.name || '-'}</strong><br>
                        <span style="color: var(--text-secondary); font-size: 0.8rem;">${activity.business || '-'}</span>
                    </td>
                    <td>${activity.number}</td>
                    <td><span class="variant-badge ${activity.variant}">${activity.variant}</span></td>
                    <td style="color: var(--text-secondary); font-size: 0.8rem;">${timeStr}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary);">No messages sent yet.</td></tr>`;
        }

    } catch (error) {
        console.error('Error fetching stats:', error);
        document.getElementById('status-badge').className = 'status offline';
        document.getElementById('status-badge').textContent = 'Server Offline';
    }
}

// Fetch immediately, then every 5 seconds
fetchStats();
setInterval(fetchStats, 5000);
