// js/store-pricing.js

let wholesalePrices = [];
let customStorePrices = [];

/**
 * Initialize Pricing Management
 */
async function initStorePricing(role) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
        // 1. Fetch Wholesale Prices (Cost) for the Agent's Role
        const { data: wholesale, error: wErr } = await supabase
            .from('pricing')
            .select('*')
            .eq('role', role || 'client')
            .order('bundle', { ascending: true });

        if (wErr) throw wErr;
        wholesalePrices = wholesale || [];

        // 2. Fetch Agent's Custom Store Prices (Retail)
        const { data: custom, error: cErr } = await supabase
            .from('store_pricing')
            .select('*')
            .eq('user_id', user.id);

        if (cErr) throw cErr;
        customStorePrices = custom || [];

        renderPricingTable();
    } catch (err) {
        console.error("Error loading pricing data:", err);
    }
}

function renderPricingTable() {
    const table = document.getElementById('storePricingTable');
    if (!table) return;
    table.innerHTML = "";

    wholesalePrices.forEach(p => {
        const custom = customStorePrices.find(cp => cp.product === p.product && cp.gb_size === p.bundle);
        const cost = parseFloat(p.price);
        
        // Use custom price if set, otherwise default to 15% markup (same as store-front.js logic)
        const defaultRetail = cost + (cost * 0.15) > cost + 1 ? cost + 1.5 : cost + 1;
        const sellingPrice = custom ? parseFloat(custom.selling_price) : defaultRetail;
        const profit = sellingPrice - cost;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding: 12px; font-weight: 600;">${p.bundle}GB (${p.product.toUpperCase().replace('DATA_', '')})</td>
            <td style="padding: 12px; color: #64748b;">₵${cost.toFixed(2)}</td>
            <td style="padding: 8px;">
                <input type="number" step="0.01" 
                    value="${sellingPrice.toFixed(2)}" 
                    class="price-input" 
                    data-product="${p.product}" 
                    data-gb="${p.bundle}"
                    oninput="calculateRowProfit(this, ${cost})"
                    style="width: 100%; max-width: 100px; padding: 8px; border: 1.5px solid #e2e8f0; border-radius: 8px; font-weight: 700; color: #1e293b;">
            </td>
            <td style="padding: 12px; font-weight: 700; color: ${profit >= 0 ? '#10b981' : '#ef4444'};" class="profit-cell">
                ₵${profit.toFixed(2)}
            </td>
        `;
        table.appendChild(row);
    });
}

function calculateRowProfit(input, cost) {
    const sellingPrice = parseFloat(input.value) || 0;
    const profitCell = input.closest('tr').querySelector('.profit-cell');
    const profit = sellingPrice - cost;
    
    profitCell.innerText = `₵${profit.toFixed(2)}`;
    profitCell.style.color = profit >= 0 ? '#10b981' : '#ef4444';
}

/**
 * Save all custom prices in batch
 */
async function saveAllPrices() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const saveBtn = document.querySelector('button[onclick="saveAllPrices()"]');
    const originalText = saveBtn.innerText;
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    const inputs = document.querySelectorAll('.price-input');
    const overrides = Array.from(inputs).map(input => ({
        user_id: user.id,
        product: input.dataset.product,
        gb_size: parseFloat(input.dataset.gb),
        selling_price: parseFloat(input.value)
    }));

    try {
        // Upsert all pricing overrides
        const { error } = await supabase
            .from('store_pricing')
            .upsert(overrides, { onConflict: 'user_id, product, gb_size' });

        if (error) throw error;
        
        if (window.showToast) window.showToast("Storefront prices updated!", 'success');
        else alert("Storefront prices updated!");
        
    } catch (err) {
        console.error("Save error:", err);
        if (window.showToast) window.showToast("Failed to save prices: " + err.message, 'error');
        else alert("Failed to save prices: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = originalText;
    }
}
