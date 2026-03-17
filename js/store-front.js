// js/store-front.js

let currentAgent = null;
let selectedNet = 'MTN';
let availableBundles = [];
let agentCustomPrices = [];
let paystackPublicKey = ''; // Loaded from app_settings

/**
 * Initialize Storefront context
 */
async function initStore() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get('ref');

    if (!slug) {
        showError("Invalid Store Link", "Please ensure you have the correct URL from your agent.");
        return;
    }

    try {
        // Fetch Agent Details
        const { data: agent, error } = await supabase
            .from('users')
            .select('id, store_name, business_name, store_description, whatsapp_number, whatsapp_community_link, store_active, role')
            .eq('store_slug', slug)
            .single();

        if (error || !agent || !agent.store_active) {
            showError("Store Not Found", "This store is either inactive or doesn't exist.");
            return;
        }

        currentAgent = agent;
        document.getElementById('storeName').innerText = agent.store_name || agent.business_name || "Official Storefront";
        document.getElementById('storeOwner').innerText = `Powered by ${agent.business_name || 'Verified Agent'}`;

        // Description
        const descElem = document.getElementById('storeDescription');
        if (agent.store_description) {
            descElem.innerText = agent.store_description;
            descElem.style.display = 'block';
        }

        // WhatsApp Integrations
        if (agent.whatsapp_number || agent.whatsapp_community_link) {
            document.getElementById('whatsappActions').style.display = 'flex';
            
            if (agent.whatsapp_number) {
                const cleanPhone = agent.whatsapp_number.replace(/\D/g, '');
                document.getElementById('whatsappContactBtn').href = `https://wa.me/${cleanPhone}`;
            } else {
                document.getElementById('whatsappContactBtn').style.display = 'none';
            }

            if (agent.whatsapp_community_link) {
                document.getElementById('whatsappCommunityBtn').href = agent.whatsapp_community_link;
            } else {
                document.getElementById('whatsappCommunityBtn').style.display = 'none';
            }
        }

        // Load Pricing for this Agent's Role
        await loadPricing(agent.role);

        // Load Paystack Public Key
        const { data: psKey } = await supabase.from('app_settings').select('value').eq('key', 'paystack_public_key').single();
        if (psKey) paystackPublicKey = psKey.value;

    } catch (err) {
        console.error("Store init error:", err);
        showError("System Error", "Failed to load store connectivity.");
    }
}

/**
 * Load pricing and populate select
 */
async function loadPricing(role) {
    try {
        const { data: prices, error } = await supabase
            .from('pricing')
            .select('*')
            .eq('role', role || 'client')
            .order('bundle', { ascending: true });

        if (error) throw error;

        availableBundles = prices;

        // 2. Fetch Agent's Custom Price Overrides
        const { data: custom, error: cErr } = await supabase
            .from('store_pricing')
            .select('*')
            .eq('user_id', currentAgent.id);

        if (!cErr) {
            agentCustomPrices = custom || [];
        }

        updateBundleSelect();
    } catch (err) {
        console.error("Pricing error:", err);
    }
}

function updateBundleSelect() {
    const select = document.getElementById('bundleSelect');
    select.innerHTML = '<option value="" disabled selected>Choose bundle...</option>';

    // Filter by network (assuming network-specific pricing)
    const filtered = availableBundles.filter(p => {
        const net = p.product.toLowerCase();
        if (selectedNet === 'MTN') return net.includes('mtn');
        if (selectedNet === 'Telecel') return net.includes('telecel');
        return net.includes('ishare') || net.includes('at');
    });

    filtered.forEach(p => {
        // 1. Get Base Wholesale Cost
        const wholesale = parseFloat(p.price);

        // 2. Check for Agent Override
        const override = agentCustomPrices.find(cp => cp.product === p.product && cp.gb_size === p.bundle);
        
        // 3. APPLY RETAIL MARKUP (Default: ₵1.5 or 15%)
        let retail;
        if (override) {
            retail = parseFloat(override.selling_price);
        } else {
            retail = wholesale + (wholesale * 0.15) > wholesale + 1 ? wholesale + 1.5 : wholesale + 1;
        }
        
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.dataset.retail = retail.toFixed(2);
        opt.dataset.bundle = p.bundle;
        opt.dataset.wholesale = wholesale;
        opt.innerText = `${p.bundle}GB - ₵${retail.toFixed(2)}`;
        select.appendChild(opt);
    });
}

/**
 * UI Event Handlers
 */
function setNet(net) {
    selectedNet = net;
    document.querySelectorAll('.net-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.net === net);
    });
    updateBundleSelect();
    updateTotal();
}

function detectNetwork() {
    const phone = document.getElementById('recipientPhone').value.trim();
    const badge = document.getElementById('networkBadge');
    
    if (phone.length >= 3) {
        const prefix = phone.substring(0,3);
        const mtn = ['024', '054', '055', '059', '025'];
        const tel = ['020', '050'];
        const at = ['027', '057', '026', '056'];

        badge.style.display = 'block';
        if (mtn.includes(prefix)) {
            badge.innerText = "MTN Network Detected";
            setNet('MTN');
        } else if (tel.includes(prefix)) {
            badge.innerText = "Telecel Network Detected";
            setNet('Telecel');
        } else if (at.includes(prefix)) {
            badge.innerText = "AT/iShare Detected";
            setNet('Ishare');
        } else {
            badge.innerText = "Unknown Network";
        }
    } else {
        badge.style.display = 'none';
    }
}

function updateTotal() {
    const select = document.getElementById('bundleSelect');
    const selected = select.options[select.selectedIndex];
    const feeElem = document.getElementById('serviceFee');
    const totalElem = document.getElementById('totalPrice');
    
    if (selected && selected.dataset.retail) {
        const retail = parseFloat(selected.dataset.retail);
        const fee = retail * 0.02;
        const total = retail + fee;
        
        feeElem.innerText = `₵${fee.toFixed(2)}`;
        totalElem.innerText = `₵${total.toFixed(2)}`;
    } else {
        if (feeElem) feeElem.innerText = `₵0.00`;
        totalElem.innerText = `₵0.00`;
    }
}

/**
 * Payment Integration
 */
function initiatePayment() {
    const phone = document.getElementById('recipientPhone').value.trim();
    const select = document.getElementById('bundleSelect');
    const selected = select.options[select.selectedIndex];

    if (!phone || phone.length < 10) {
        alert("Please enter a valid 10-digit phone number");
        return;
    }
    if (!selected.value) {
        alert("Please select a data bundle");
        return;
    }

    const retail = parseFloat(selected.dataset.retail);
    const fee = retail * 0.02;
    const finalAmount = retail + fee;

    const bundleSize = selected.dataset.bundle;
    const wholesalePrice = selected.dataset.wholesale;

    if (!paystackPublicKey || paystackPublicKey.includes('PLACEHOLDER')) {
        alert("Payment gateway is not configured for this store. Please contact support.");
        return;
    }

    // PAYSTACK POPUP
    const handler = PaystackPop.setup({
        key: paystackPublicKey,
        email: 'customer@data4ghana.com',
        amount: Math.round(finalAmount * 100), // In pesewas
        currency: 'GHS',
        metadata: {
            custom_fields: [
                { display_name: "Agent ID", variable_name: "agent_id", value: currentAgent.id },
                { display_name: "Recipient", variable_name: "recipient", value: phone },
                { display_name: "Bundle", variable_name: "bundle", value: bundleSize }
            ],
            network: selectedNet // Included for Edge Function
        },
        callback: function(response) {
            verifyStorePurchase(response.reference, phone, bundleSize, finalAmount);
        },
        onClose: function() {
            alert('Transaction cancelled');
        }
    });
    handler.openIframe();
}

/**
 * Final Order Processing (Secure Verification)
 */
async function verifyStorePurchase(ref, recipient, bundle, paid) {
    const payBtn = document.getElementById('payBtn');
    const originalText = payBtn.innerText;
    payBtn.disabled = true;
    payBtn.innerText = "Verifying Secure Payment...";

    try {
        // CALL SECURE EDGE FUNCTION FOR VERIFICATION & ORDER CREATION
        const { data, error } = await window.supabase.functions.invoke('verify-store-purchase', {
            body: { reference: ref }
        });

        if (error || (data && data.error)) {
            throw new Error(error?.message || data?.error || "Verification failed.");
        }

        if (data.success) {
            // Show Success Overlay
            document.getElementById('successPhone').innerText = recipient;
            document.getElementById('successReceipt').innerHTML = `
                <strong>Order ID:</strong> #${data.orderId}<br>
                <strong>Reference:</strong> ${ref}<br>
                <strong>Bundle:</strong> ${bundle}GB ${selectedNet}<br>
                <strong>Amount Paid:</strong> ₵${paid.toFixed(2)}<br>
                <strong>Status:</strong> Processing Delivery ✨
            `;
            document.getElementById('successOverlay').classList.add('active');
        }
        
    } catch (err) {
        console.error("Storefront verification error:", err);
        alert("Payment was successful, but order creation failed: " + err.message + "\nPlease contact support with reference: " + ref);
    } finally {
        payBtn.disabled = false;
        payBtn.innerText = originalText;
    }
}

function showError(title, msg) {
    document.querySelector('.store-main').innerHTML = `
        <div style="text-align:center; padding: 60px 20px; background:white; border-radius:32px; box-shadow:var(--shadow-card); width:100%;">
            <div style="font-size:48px; margin-bottom:20px;">⚠️</div>
            <h2 style="margin:0; font-size:24px;">${title}</h2>
            <p style="color:var(--text-muted); margin:10px 0 30px;">${msg}</p>
            <button onclick="window.history.back()" style="padding:12px 24px; border-radius:12px; background:var(--text-main); color:white; border:none; font-weight:700; cursor:pointer;">Go Back</button>
        </div>
    `;
    document.querySelector('.store-main').style.gridTemplateColumns = "1fr";
}

// Start
initStore();
