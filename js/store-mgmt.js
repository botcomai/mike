// js/store-mgmt.js

/**
 * Initialize Storefront Management module
 */
async function initStorefront() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load initial store settings
    const { data: userData, error } = await supabase
        .from('users')
        .select('store_slug, store_name, store_description, whatsapp_number, whatsapp_community_link, store_active, role, wallet_balance, store_paid')
        .eq('id', user.id)
        .single();

    if (error) {
        console.error("Error loading storefront data:", error);
        return;
    }

    // Only show storefront module for Agents/Admins
    const storefrontModule = document.getElementById('storefrontModule');
    if (!storefrontModule) return;

    if (['admin', 'super_agent', 'elite_agent'].includes(userData.role)) {
        storefrontModule.style.display = 'block';
    } else {
        storefrontModule.style.display = 'none';
        return;
    }

    // Populate fields
    if (userData.store_name) document.getElementById('storeNameInput').value = userData.store_name;
    if (userData.store_slug) document.getElementById('storeSlugInput').value = userData.store_slug;
    if (userData.store_description) document.getElementById('storeDescriptionInput').value = userData.store_description;
    if (userData.whatsapp_number) document.getElementById('storeWhatsappInput').value = userData.whatsapp_number;
    if (userData.whatsapp_community_link) document.getElementById('storeCommunityInput').value = userData.whatsapp_community_link;
    
    const activeToggle = document.getElementById('storeActiveToggle');
    if (activeToggle) activeToggle.checked = userData.store_active || false;

    updateStoreLinkPreview(userData.store_slug, userData.store_active);

    // Initialise Custom Pricing Sub-module
    if (window.initStorePricing) {
        initStorePricing(userData.role);
    }
}

/**
 * Toggle store public status
 */
async function toggleStoreStatus() {
    const activeToggle = document.getElementById('storeActiveToggle');
    const active = activeToggle.checked;
    const { data: { user } } = await supabase.auth.getUser();

    try {
        // Fetch latest user data to check payment status and balance
        const { data: userData } = await supabase.from('users').select('store_paid, wallet_balance').eq('id', user.id).single();
        
        // IF activating and NOT yet paid
        if (active && (!userData || !userData.store_paid)) {
            const fee = 20.00;
            const balance = parseFloat(userData.wallet_balance || 0);

            if (balance < fee) {
                showToast(`Insufficient balance. Store activation requires a one-time fee of ₵${fee.toFixed(2)}. Your balance: ₵${balance.toFixed(2)}`, 'warning');
                activeToggle.checked = false;
                return;
            }

            if (!confirm(`Activating your storefront requires a ONE-TIME fee of ₵${fee.toFixed(2)}. This will be deducted from your wallet. Proceed?`)) {
                activeToggle.checked = false;
                return;
            }

            // PROCESS PAYMENT
            const newBalance = (balance - fee).toFixed(2);
            
            // 1. Update User (Balance + Paid Flag)
            const { error: upErr } = await supabase.from('users').update({ 
                wallet_balance: newBalance,
                store_paid: true 
            }).eq('id', user.id);
            if (upErr) throw upErr;

            // 2. Record Transaction
            await supabase.from('transactions').insert({
                user_id: user.id,
                amount: fee,
                type: 'Store Activation Fee',
                balance_before: balance,
                balance_after: newBalance,
                status: 'completed'
            });

            showToast(`₵${fee.toFixed(2)} activation fee paid successfully!`, 'success');
        }

        const { error } = await supabase
            .from('users')
            .update({ store_active: active })
            .eq('id', user.id);

        if (error) throw error;

        const slug = document.getElementById('storeSlugInput').value;
        updateStoreLinkPreview(slug, active);
        
        showToast(active ? "Storefront is now PUBLIC" : "Storefront is now HIDDEN", active ? 'success' : 'info');
    } catch (err) {
        showToast("Failed to update status: " + err.message, 'error');
        activeToggle.checked = !active; // revert
    }
}

/**
 * Save store name and slug
 */
async function saveStoreSettings() {
    const name = document.getElementById('storeNameInput').value.trim();
    const slug = document.getElementById('storeSlugInput').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    
    if (!name || !slug) {
        showToast("Name and Slug are required", 'warning');
        return;
    }

    const saveBtn = document.querySelector('.sm-save-btn');
    const originalText = saveBtn.innerText;
    saveBtn.disabled = true;
    saveBtn.innerText = "Saving...";

    const { data: { user } } = await supabase.auth.getUser();

    try {
        // Check if slug is taken (if changed)
        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('store_slug', slug)
            .neq('id', user.id)
            .maybeSingle();

        if (existing) {
            throw new Error("This store URL ID is already taken. Try another.");
        }

        const description = document.getElementById('storeDescriptionInput').value.trim();
        const whatsapp = document.getElementById('storeWhatsappInput').value.trim();
        const community = document.getElementById('storeCommunityInput').value.trim();

        const { error } = await supabase
            .from('users')
            .update({ 
                store_name: name,
                store_slug: slug,
                store_description: description,
                whatsapp_number: whatsapp,
                whatsapp_community_link: community
            })
            .eq('id', user.id);

        if (error) throw error;

        const active = document.getElementById('storeActiveToggle').checked;
        updateStoreLinkPreview(slug, active);
        showToast("Store settings updated successfully", 'success');
        
        document.getElementById('storeSlugInput').value = slug; // Update cleaned slug
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = originalText;
    }
}

/**
 * Update the visual link preview
 */
function updateStoreLinkPreview(slug, active) {
    const preview = document.getElementById('storeLinkPreview');
    if (!preview) return;

    if (slug && active) {
        preview.style.display = 'flex';
        const url = `${window.location.origin}/store.html?ref=${slug}`;
        document.getElementById('publicStoreUrl').innerText = url;
    } else {
        preview.style.display = 'none';
    }
}

/**
 * Copy store link to clipboard
 */
async function copyStoreLink() {
    const url = document.getElementById('publicStoreUrl').innerText;
    try {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard!", 'success');
    } catch (err) {
        showToast("Failed to copy link", 'error');
    }
}

/**
 * Toast Helper (matches dashboard style if not present)
 */
function showToast(message, type = 'info') {
    // If global showToast exists, use it
    if (window.showToast) {
        window.showToast(message, type);
    } else {
        alert(message);
    }
}

// Global initialization override for dashboard
if (window.loadDashboardData) {
    const originalLoad = window.loadDashboardData;
    window.loadDashboardData = async () => {
        await originalLoad();
        initStorefront();
    };
} else {
    document.addEventListener('DOMContentLoaded', initStorefront);
}
