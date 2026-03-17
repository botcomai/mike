// js/earnings.js

let currentBalance = 0;

async function initEarnings() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    await fetchEarningsData(user.id);
    await fetchWithdrawalHistory(user.id);
}

async function fetchEarningsData(userId) {
    const { data, error } = await supabase
        .from('users')
        .select('commission_balance, total_earnings')
        .eq('id', userId)
        .single();

    if (error) {
        console.error("Error fetching balance:", error);
        return;
    }

    currentBalance = parseFloat(data.commission_balance || 0);
    document.getElementById('availableBalance').innerText = `₵${currentBalance.toFixed(2)}`;
    document.getElementById('lifetimeEarnings').innerText = `₵${parseFloat(data.total_earnings || 0).toFixed(2)}`;

    // Calculate pending withdrawals
    const { data: withdrawals } = await supabase
        .from('withdrawal_requests')
        .select('amount')
        .eq('user_id', userId)
        .eq('status', 'pending');

    const pendingTotal = (withdrawals || []).reduce((sum, w) => sum + parseFloat(w.amount), 0);
    document.getElementById('pendingWithdrawals').innerText = `₵${pendingTotal.toFixed(2)}`;
}

async function fetchWithdrawalHistory(userId) {
    const { data, error } = await supabase
        .from('withdrawal_requests')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Error fetching history:", error);
        return;
    }

    renderHistory(data || []);
}

function renderHistory(records) {
    const table = document.getElementById('withdrawalHistoryTable');
    table.innerHTML = "";

    if (records.length === 0) {
        table.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:80px;">
            <div style="font-size:48px; margin-bottom:20px;">🛡️</div>
            <h3 style="margin:0; color:#1e293b;">No History Yet</h3>
            <p style="color:#64748b; margin:10px 0 0;">Your payout requests will appear here once submitted.</p>
        </td></tr>`;
        return;
    }

    records.forEach(rec => {
        const row = document.createElement('tr');
        const date = new Date(rec.created_at).toLocaleDateString('en-GB', { 
            day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' 
        });
        
        const details = rec.method === 'momo' 
            ? `<div class="method-icon">📱 MoMo</div>
               <span class="acc-details">${rec.account_name || 'N/A'} • ${rec.momo_number}</span>`
            : `<div class="method-icon">💳 Wallet</div>
               <span class="acc-details">Internal Instant Transfer</span>`;

        row.innerHTML = `
            <td style="font-weight:600; color:#475569;">${date}</td>
            <td style="text-transform:uppercase; font-size:12px; font-weight:800;">${rec.method}</td>
            <td style="font-weight:800; color:#1e293b; font-size:15px;">₵${parseFloat(rec.amount).toFixed(2)}</td>
            <td><span class="w-status ${rec.status}">${rec.status}</span></td>
            <td>${details}</td>
        `;
        table.appendChild(row);
    });
}

async function submitWithdrawal() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const method = document.getElementById('withdrawalMethod').value;
    const amount = parseFloat(document.getElementById('withdrawalAmount').value);
    const momo = document.getElementById('momoNumber').value.trim();
    const accountName = document.getElementById('accountName').value.trim();

    if (!amount || amount < 10) {
        alert("Minimum withdrawal is ₵10.00");
        return;
    }

    if (amount > currentBalance) {
        alert("Insufficient earnings for this withdrawal.");
        return;
    }

    if (method === 'momo') {
        if (!momo) { alert("Please enter your MoMo number."); return; }
        if (!accountName) { alert("Please enter the account name for verification."); return; }
    }

    const btn = document.querySelector('.withdraw-btn');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Processing Transaction...";

    try {
        if (method === 'wallet') {
            // Instant internal transfer via RPC
            const { data, error } = await supabase.rpc('withdraw_commission_to_wallet', {
                amount_to_withdraw: amount
            });

            if (error) throw error;
            alert("✨ Success! Funds moved to your main wallet balance.");
        } else {
            // MoMo Request (requires admin approval)
            const { error } = await supabase.from('withdrawal_requests').insert({
                user_id: user.id,
                amount: amount,
                method: 'momo',
                momo_number: momo,
                account_name: accountName,
                status: 'pending'
            });

            if (error) throw error;
            alert("🚀 Request Submitted! Payout will be processed within 1-6 business hours.");
        }

        // Refresh UI
        document.getElementById('withdrawalAmount').value = "";
        document.getElementById('accountName').value = "";
        document.getElementById('momoNumber').value = "";
        await initEarnings();
        
    } catch (err) {
        console.error("Withdrawal error:", err);
        alert("Transaction Failed: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = originalText;
    }
}

// Start
initEarnings();
