<?php
require_once __DIR__ . '/../config.php';

$action = $_GET['action'] ?? '';

switch ($action) {

    // ======== REGISTER ========
    case 'register':
        $data = getInput();
        $name     = trim($data['name'] ?? '');
        $email    = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        if ($name === '' || $email === '' || strlen($password) < 4) {
            jsonResponse(['error' => 'Name, email and password (min 4 chars) required'], 400);
        }

        $db = getDB();
        $exists = $db->prepare('SELECT id FROM users WHERE email = ?');
        $exists->execute([$email]);
        if ($exists->fetch()) {
            jsonResponse(['error' => 'Email already registered'], 409);
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "student")');
        $stmt->execute([$name, $email, $hash]);

        $userId = $db->lastInsertId();
        $_SESSION['user_id'] = $userId;
        $_SESSION['role']    = 'student';
        $_SESSION['name']    = $name;

        jsonResponse(['success' => true, 'role' => 'student', 'name' => $name]);
        break;

    // ======== LOGIN ========
    case 'login':
        $data = getInput();
        $email    = trim($data['email'] ?? '');
        $password = $data['password'] ?? '';

        $db = getDB();
        $stmt = $db->prepare('SELECT id, name, password_hash, role, lang_pref, theme_pref FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, (string)$user['password_hash'])) {
            jsonResponse(['error' => 'Invalid email or password'], 401);
        }

        $_SESSION['user_id'] = $user['id'];
        $_SESSION['role']    = $user['role'];
        $_SESSION['name']    = $user['name'];

        jsonResponse([
            'success'    => true,
            'role'       => $user['role'],
            'name'       => $user['name'],
            'lang_pref'  => $user['lang_pref'],
            'theme_pref' => $user['theme_pref'],
        ]);
        break;

    // ======== GOOGLE LOGIN ========
    case 'google_login':
        $data = getInput();
        $credential = $data['credential'] ?? '';
        
        if (!$credential) {
            jsonResponse(['error' => 'Token required'], 400);
        }

        // Verify token via Google API (use cURL for hosting compatibility)
        $url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);
        
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        // Fix for local WAMP users missing cacert.pem
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        $result = curl_exec($ch);
        
        if ($result === false) {
            $errorMsg = curl_error($ch);
            curl_close($ch);
            jsonResponse(['error' => 'cURL connection error: ' . $errorMsg], 500);
        }
        
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        if ($httpCode !== 200) {
            jsonResponse(['error' => 'Invalid Google token. HTTP ' . $httpCode . ' Response: ' . $result], 401);
        }
        
        $payload = json_decode($result, true);
        
        if (!isset($payload['email']) || !isset($payload['email_verified']) || $payload['email_verified'] !== 'true') {
             jsonResponse(['error' => 'Google email not verified or missing'], 401);
        }
        
        $clientId = '314943612727-55qo5j4n7lek00e1eu2m64cbjli9cf08.apps.googleusercontent.com';
        if (!isset($payload['aud']) || $payload['aud'] !== $clientId) {
             jsonResponse(['error' => 'Invalid Google Client ID (aud mismatch)'], 401);
        }

        $email = $payload['email'];
        $name = $payload['name'] ?? 'Google User';
        
        $db = getDB();
        $stmt = $db->prepare('SELECT id, name, role, lang_pref, theme_pref FROM users WHERE email = ?');
        $stmt->execute([$email]);
        $user = $stmt->fetch();

        if (!$user) {
            // Create user without password
            $stmt = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, NULL, "student")');
            $stmt->execute([$name, $email]);
            $userId = $db->lastInsertId();
            
            $_SESSION['user_id'] = $userId;
            $_SESSION['role']    = 'student';
            $_SESSION['name']    = $name;
            
            jsonResponse([
                'success' => true,
                'role' => 'student',
                'name' => $name,
                'lang_pref' => 'en',
                'theme_pref' => 'light'
            ]);
        } else {
            // Login user
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['role']    = $user['role'];
            $_SESSION['name']    = $user['name'];

            jsonResponse([
                'success'    => true,
                'role'       => $user['role'],
                'name'       => $user['name'],
                'lang_pref'  => $user['lang_pref'],
                'theme_pref' => $user['theme_pref'],
            ]);
        }
        break;

    // ======== LOGOUT ========
    case 'logout':
        session_destroy();
        jsonResponse(['success' => true]);
        break;

    // ======== ME (current user) ========
    case 'me':
        if (empty($_SESSION['user_id'])) {
            jsonResponse(['logged_in' => false]);
        }
        $db = getDB();
        $stmt = $db->prepare('SELECT email FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        jsonResponse([
            'logged_in' => true,
            'id'        => $_SESSION['user_id'],
            'name'      => $_SESSION['name'],
            'role'      => $_SESSION['role'],
            'email'     => $user ? $user['email'] : '',
        ]);
        break;

    // ======== CHANGE PASSWORD ========
    case 'change_password':
        if (empty($_SESSION['user_id'])) jsonResponse(['error' => 'Not logged in'], 401);
        $data = getInput();
        $oldPwd = $data['old_password'] ?? '';
        $newPwd = $data['new_password'] ?? '';
        
        if (strlen($newPwd) < 4) {
            jsonResponse(['error' => 'New password must be at least 4 chars'], 400);
        }
        
        $db = getDB();
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$_SESSION['user_id']]);
        $user = $stmt->fetch();
        
        if (!$user) {
            jsonResponse(['error' => 'User not found'], 404);
        }
        
        if (!empty($user['password_hash']) && !password_verify($oldPwd, (string)$user['password_hash'])) {
            jsonResponse(['error' => 'Incorrect current password'], 403);
        }
        
        $hash = password_hash($newPwd, PASSWORD_BCRYPT);
        $update = $db->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $update->execute([$hash, $_SESSION['user_id']]);
        
        jsonResponse(['success' => true]);
        break;

    // ======== UPDATE PREFERENCES ========
    case 'update_prefs':
        requireLogin();
        $data = getInput();
        $db = getDB();

        $fields = [];
        $params = [];
        if (isset($data['lang_pref']) && in_array($data['lang_pref'], ['en','si'])) {
            $fields[] = 'lang_pref = ?';
            $params[] = $data['lang_pref'];
        }
        if (isset($data['theme_pref']) && in_array($data['theme_pref'], ['light','dark'])) {
            $fields[] = 'theme_pref = ?';
            $params[] = $data['theme_pref'];
        }
        if (empty($fields)) {
            jsonResponse(['error' => 'Nothing to update'], 400);
        }
        $params[] = $_SESSION['user_id'];
        $db->prepare('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?')->execute($params);
        jsonResponse(['success' => true]);
        break;

    // ======== TOKEN LOGIN ========
    case 'token_login':
        $data = getInput();
        // Allow GET or POST for token login since we might call it directly via WebView URL
        $token = $data['token'] ?? ($_GET['token'] ?? '');
        
        if (!$token) {
            jsonResponse(['error' => 'Token required'], 400);
        }
        
        $db = getDB();
        
        // Ensure table exists just in case
        $db->exec("CREATE TABLE IF NOT EXISTS mobile_tokens (
            token VARCHAR(64) PRIMARY KEY,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )");
        
        // Clean up old tokens (older than 15 minutes) using MySQL syntax
        $db->exec("DELETE FROM mobile_tokens WHERE created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)");
        
        $stmt = $db->prepare('SELECT user_id FROM mobile_tokens WHERE token = ?');
        $stmt->execute([$token]);
        $row = $stmt->fetch();
        
        if (!$row) {
            jsonResponse(['error' => 'Invalid or expired token'], 401);
        }
        
        $userId = $row['user_id'];
        
        // Delete token so it can only be used once
        $stmt = $db->prepare('DELETE FROM mobile_tokens WHERE token = ?');
        $stmt->execute([$token]);
        
        // Load user
        $stmt = $db->prepare('SELECT id, name, role, lang_pref, theme_pref FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $user = $stmt->fetch();
        
        if (!$user) {
            jsonResponse(['error' => 'User not found'], 404);
        }
        
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['role']    = $user['role'];
        $_SESSION['name']    = $user['name'];

        jsonResponse([
            'success'    => true,
            'role'       => $user['role'],
            'name'       => $user['name'],
            'lang_pref'  => $user['lang_pref'],
            'theme_pref' => $user['theme_pref'],
        ]);
        break;

    default:
        jsonResponse(['error' => 'Unknown action'], 400);
}
