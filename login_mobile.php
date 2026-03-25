<?php
$isHttps = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') || 
           (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
$protocol = $isHttps ? "https" : "http";
$host = $_SERVER['HTTP_HOST'];
$path = rtrim(dirname($_SERVER['REQUEST_URI']), '/');
$callbackUrl = $protocol . "://" . $host . $path . "/google_callback_mobile.php";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sign in with Google - Class Attend</title>
    <script src="https://accounts.google.com/gsi/client" async defer></script>
    <style>
        body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f7f9fc; margin: 0; }
        .container { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center; }
        h1 { margin-top: 0; font-size: 24px; color: #333; }
        p { color: #666; margin-bottom: 24px; line-height: 1.5; }
        .status { margin-top: 20px; padding: 12px; border-radius: 8px; display: none; }
        .status.loading { display: block; background: #e8f0fe; color: #1a73e8; }
        .status.error { display: block; background: #fce8e6; color: #d93025; }
        .status.success { display: block; background: #e6f4ea; color: #1e8e3e; }
        .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #1a73e8; border-top-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 8px; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>Class Attend</h1>
        <p>Please sign in with Google to<br>continue to the mobile app.</p>
        
        <!-- Google Auth Container - using POPUP mode to avoid hosting redirect issues -->
        <div style="display: flex; justify-content: center;">
            <div id="g_id_onload"
                 data-client_id=""
                 data-context="signin"
                 data-ux_mode="popup"
                 data-callback="handleGoogleCredential"
                 data-auto_prompt="false">
            </div>
            <div class="g_id_signin"
                 data-type="standard"
                 data-shape="rectangular"
                 data-theme="outline"
                 data-text="sign_in_with"
                 data-size="large"
                 data-logo_alignment="left">
            </div>
        </div>
        
        <div id="status" class="status"></div>
    </div>

    <script>
        var callbackUrl = <?php echo json_encode($callbackUrl); ?>;

        function handleGoogleCredential(response) {
            var statusEl = document.getElementById('status');
            
            // Show loading state
            statusEl.className = 'status loading';
            statusEl.innerHTML = '<span class="spinner"></span> Signing you in...';

            // POST the credential to the server via fetch (avoids hosting redirect issues)
            fetch(callbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'credential=' + encodeURIComponent(response.credential)
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                if (data.success && data.token) {
                    statusEl.className = 'status success';
                    statusEl.innerHTML = '✅ Authentication successful! Opening app...';
                    
                    // Redirect to the mobile app via deep link
                    setTimeout(function() {
                        window.location.href = 'classattend://login?token=' + encodeURIComponent(data.token);
                    }, 500);
                } else {
                    statusEl.className = 'status error';
                    statusEl.innerHTML = '❌ Login failed: ' + (data.error || 'Unknown error');
                }
            })
            .catch(function(err) {
                statusEl.className = 'status error';
                statusEl.innerHTML = '❌ Connection error. Please try again.';
                console.error('Auth error:', err);
            });
        }
    </script>
</body>
</html>
