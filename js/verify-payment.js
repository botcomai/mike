// ==========================================
// PAYSTACK VERIFICATION LOGIC
// ==========================================

async function startVerification() {
    const ref = document.getElementById('paystackRef').value.trim();
    const btn = document.getElementById('verifyBtn');

    if (!ref) {
        alert("Please enter your Paystack reference number.");
        return;
    }

    // Confirmation if user is sure
    if (!confirm("Are you sure you want to verify this reference? False or manipulative attempts will result in account suspension.")) {
        return;
    }

    try {
        btn.disabled = true;
        btn.innerText = "Verifying with Paystack...";

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !session) {
            alert("Your session has expired. Please login again.");
            window.location.href = "login.html";
            return;
        }

        // Call the Edge Function
        // Assuming the function is deployed at the default supabase endpoint
        const { data, error } = await supabase.functions.invoke('verify-paystack', {
            body: { reference: ref }
        });

        if (error) {
            // Handle Edge Function infrastructure errors
            throw new Error(error.message || "Failed to communicate with verification server.");
        }

        if (data.error) {
            // Handle business logic errors from our function
            if(window.showErrorPopup) {
                window.showErrorPopup("Verification Failed", data.error);
            } else {
                alert("Verification Failed: " + data.error);
            }
            btn.disabled = false;
            btn.innerText = "Verify & Credit Wallet";
            return;
        }

        // Success!
        if (data.success) {
            if(window.showSuccessPopup) {
                window.showSuccessPopup("Wallet Funded!", data.message, () => {
                    window.location.href = "wallet.html";
                });
            } else {
                alert("✅ Success! " + data.message);
                window.location.href = "wallet.html";
            }
        }

    } catch (err) {
        console.error("Verification Error:", err);
        if(window.showErrorPopup) {
            window.showErrorPopup("Unexpected Error", err.message);
        } else {
            alert("An unexpected error occurred: " + err.message);
        }
        btn.disabled = false;
        btn.innerText = "Verify & Credit Wallet";
    }
}
