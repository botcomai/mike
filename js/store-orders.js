// js/store-orders.js

let allStoreOrders = [];

async function initStoreOrders() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    // Load user info for badge
    const { data: userData } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (userData) {
        document.getElementById('userName').innerText = userData.business_name || userData.first_name || 'Agent';
        document.getElementById('userInitials').innerText = (userData.first_name?.[0] || 'A').toUpperCase();
    }

    await fetchStoreOrders(user.id);
}

async function fetchStoreOrders(agentId) {
    // Fetch orders marked as storefront orders for this agent
    const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('user_id', agentId)
        .eq('is_store_order', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching store orders:", error);
        return;
    }

    allStoreOrders = data || [];
    renderStoreOrders(allStoreOrders);
    updateStats(allStoreOrders);
}

function renderStoreOrders(orders) {
    const table = document.getElementById('storeOrdersTable');
    table.innerHTML = "";

    if (orders.length === 0) {
        table.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:80px;">
            <div style="font-size:48px; margin-bottom:20px;">📦</div>
            <h3 style="margin:0; color:#1e293b;">No Store Orders Yet</h3>
            <p style="color:#64748b; margin:10px 0 0;">Transactions from your storefront will appear here.</p>
        </td></tr>`;
        return;
    }

    orders.forEach(order => {
        const row = document.createElement('tr');
        const dateStr = new Date(order.created_at).toLocaleDateString('en-GB', { 
            day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' 
        });
        
        // Status Formatting
        let status = (order.status || 'pending').toLowerCase();
        if (status === 'true') status = 'completed';
        const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);

        // Customer Info (Avatar + Phone)
        const phone = order.phone || '0000000000';
        const initial = phone.substring(phone.length - 2);

        // Profit Calculation
        const paid = parseFloat(order.price || order.amount || 0);
        const cost = parseFloat(order.wholesale_cost || 0);
        const profit = paid - cost;
        const profitHtml = cost > 0 ? `<span class="profit-label">Profit: +₵${profit.toFixed(2)}</span>` : '';

        row.innerHTML = `
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span style="font-weight:800; color:#1e293b; font-size:14px;">#${order.id.toString().substring(0,8).toUpperCase()}</span>
                    <span style="font-size:11px; color:#94a3b8; font-weight:600;">REF: ${order.reference?.substring(0,10) || 'DIRECT'}</span>
                </div>
            </td>
            <td><span class="status ${status}">${displayStatus}</span></td>
            <td>
                <div class="customer-pill">
                    <div class="cust-avatar">${initial}</div>
                    <span class="cust-phone">${phone}</span>
                </div>
            </td>
            <td><span class="bundle-badge">${order.bundle || order.plan || '-'} ${order.network || ''}</span></td>
            <td>
                <div style="display:flex; flex-direction:column;">
                    <span style="font-weight:800; color:#1e293b; font-size:15px;">₵${paid.toFixed(2)}</span>
                    ${profitHtml}
                </div>
            </td>
            <td style="color:#64748b; font-size:13px; font-weight:500;">${dateStr}</td>
        `;
        table.appendChild(row);
    });
}

function updateStats(orders) {
    const revenue = orders.reduce((sum, o) => sum + parseFloat(o.price || o.amount || 0), 0);
    const profit = orders.reduce((sum, o) => {
        const paid = parseFloat(o.price || o.amount || 0);
        const cost = parseFloat(o.wholesale_cost || 0);
        // If wholesale_cost exists, use it. Otherwise fallback to ~13% estimation (net of 15% markup)
        return sum + (cost > 0 ? (paid - cost) : (paid * 0.13));
    }, 0);

    document.getElementById('storeRevenue').innerText = `₵${revenue.toFixed(2)}`;
    document.getElementById('storeOrderCount').innerText = orders.length;
    document.getElementById('storeProfit').innerText = `₵${profit.toFixed(2)}`;
}

function applyFilters() {
    const phone = document.getElementById('phoneFilter').value.trim().toLowerCase();
    const date = document.getElementById('dateFilter').value;
    const status = document.getElementById('statusFilter').value;

    const filtered = allStoreOrders.filter(o => {
        let match = true;
        if (phone) match = match && (o.phone || '').includes(phone);
        if (date) {
            const oDate = new Date(o.created_at).toISOString().split('T')[0];
            match = match && oDate === date;
        }
        if (status) match = match && (o.status || '').toLowerCase() === status.toLowerCase();
        return match;
    });

    renderStoreOrders(filtered);
}

// Start
initStoreOrders();
