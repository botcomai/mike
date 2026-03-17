let userPhoneNumbers = [];

// 1. Authenticate and Load Contacts
async function loadAdminData() {
    console.log("SMS Broadcast: Loading admin data...");
    const { data: { user } } = await supabase.auth.getUser();
    if(!user) {
        console.warn("SMS Broadcast: No authenticated user found.");
        window.location.href = "login.html";
        return;
    }

    try {
        // 1. Verify Administrative privileges first
        const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || !profile || profile.role !== 'admin') {
            console.error("SMS Broadcast: Access Denied. User role:", profile?.role);
            alert("Error: You do not have permission to access the user database.");
            return;
        }

        console.log("SMS Broadcast: Admin verified (Role:", profile.role + ")");

        // 2. Fetch all registered users' phone numbers
        const { data, error } = await supabase
            .from('users')
            .select('phone');

        if(error) {
            console.error("SMS Broadcast: Query Error:", error);
            throw error;
        }

        console.log(`SMS Broadcast: Fetched ${data ? data.length : 0} total user rows.`);

        // Strip duplicates and blanks
        const rawNumbers = data.map(u => u.phone).filter(p => p && p.trim() !== "");
        userPhoneNumbers = [...new Set(rawNumbers)];

        console.log(`SMS Broadcast: Found ${userPhoneNumbers.length} unique valid phone numbers.`);
        document.getElementById('userCount').innerText = userPhoneNumbers.length;
        
    } catch (err) {
        console.error("SMS Broadcast: Failed to load users:", err);
        alert("Error loading contact list from database: " + err.message);
    }
}

// 2. Fetch SMS Balance from our Secure Edge Function
async function checkSmsBalance() {
    const balanceElem = document.getElementById('smsBalance');
    balanceElem.innerText = "...";

    try {
        const { data, error } = await supabase.functions.invoke('check-sms-balance');
        if (error) throw error;
        
        let responseString = data.balance_response || "";
        
        // BulkSMSGh typically returns balance as "1000|Success"
        if(responseString.includes("|")) {
            balanceElem.innerText = responseString.split("|")[0];
        } else {
            balanceElem.innerText = responseString;
        }

    } catch (err) {
        console.error("Balance Check Error:", err);
        balanceElem.innerText = "Error";
    }
}

// 3. Track character count as the admin types
document.getElementById('broadcastMessage').addEventListener('input', function() {
    document.getElementById('charCount').innerText = this.value.length;
});

// 4. Main Dispatch Loop
async function confirmBroadcast() {
    const text = document.getElementById('broadcastMessage').value.trim();
    
    if(text === "") {
        alert("Please enter a message to broadcast.");
        return;
    }

    if(userPhoneNumbers.length === 0) {
        alert("No valid phone numbers found in the database to text.");
        return;
    }

    // Double Confirmation dialog
    const confirmed = confirm(`WARNING: You are about to text ${userPhoneNumbers.length} people.\n\nMessage: "${text}"\n\nAre you absolutely sure you want to broadcast this?`);
    
    if(!confirmed) return;

    const btn = document.getElementById('sendBtn');
    const progContainer = document.getElementById('progressContainer');
    const progBar = document.getElementById('progressBar');
    const progStatus = document.getElementById('progressStatus');

    btn.disabled = true;
    btn.innerText = "Broadcast in Progress...";
    
    progContainer.style.display = 'block';
    progStatus.style.display = 'block';
    progBar.style.width = '0%';

    let successCount = 0;
    let failCount = 0;
    const total = userPhoneNumbers.length;

    // We dispatch in chunks to balance speed and reliability
    const CHUNK_SIZE = 10; 
    
    for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = userPhoneNumbers.slice(i, i + CHUNK_SIZE);
        
        progStatus.innerText = `Dispatching chunk ${Math.floor(i/CHUNK_SIZE) + 1}... (${i}/${total})`;
        
        // Execute chunk in parallel
        const promises = chunk.map(async (phone) => {
            try {
                const { error } = await supabase.functions.invoke('send-sms', {
                    body: { to: phone, msg: text }
                });
                if (error) throw error;
                successCount++;
            } catch (err) {
                console.error(`Failed SMS to ${phone}:`, err);
                failCount++;
            }
        });

        await Promise.all(promises);

        // Update progress bar
        const progress = Math.min(((i + chunk.length) / total) * 100, 100);
        progBar.style.width = `${progress}%`;
    }

    // Done
    btn.disabled = false;
    btn.innerHTML = "🚀 Dispatch to All Users";
    progStatus.innerText = `Broadcast finished: ${successCount} sent, ${failCount} failed.`;
    
    document.getElementById('broadcastMessage').value = "";
    document.getElementById('charCount').innerText = "0";

    if(window.showSuccessPopup) {
        window.showSuccessPopup("Broadcast Complete!", `Sent to ${successCount} users. ${failCount} failed.`);
    } else {
        alert(`Broadcast Complete!\nSuccess: ${successCount}\nFailed: ${failCount}`);
    }

    // Refresh balance after sending
    checkSmsBalance();

    // Hide progress after 5 seconds
    setTimeout(() => {
        progContainer.style.display = 'none';
        progStatus.style.display = 'none';
    }, 8000);
}

// Initialize scripts
window.addEventListener('DOMContentLoaded', () => {
    loadAdminData();
    checkSmsBalance();
});
