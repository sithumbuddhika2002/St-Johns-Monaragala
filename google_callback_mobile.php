<?php
require_once __DIR__ . '/config.php';
header('Content-Type: application/json');

// Accept both POST and GET
$credential = $_POST['credential'] ?? $_GET['credential'] ?? '';
if (!$credential) {
    echo json_encode(['success' => false, 'error' => 'Google credential missing']);
    exit;
}

// Verify token via Google API
$url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($credential);

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$result = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($result === false || $httpCode !== 200) {
    echo json_encode(['success' => false, 'error' => 'Invalid Google token']);
    exit;
}

$payload = json_decode($result, true);

if (!isset($payload['email']) || !isset($payload['email_verified']) || $payload['email_verified'] !== 'true') {
    echo json_encode(['success' => false, 'error' => 'Google email not verified']);
    exit;
}

$clientId = '';
if (!isset($payload['aud']) || $payload['aud'] !== $clientId) {
    echo json_encode(['success' => false, 'error' => 'Invalid Google Client ID']);
    exit;
}

$email = $payload['email'];
$name = $payload['name'] ?? 'Google User';

$db = getDB();

// Ensure mobile_tokens table exists
$db->exec("CREATE TABLE IF NOT EXISTS mobile_tokens (
    token VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)");

$stmt = $db->prepare('SELECT id, name, role FROM users WHERE email = ?');
$stmt->execute([$email]);
$user = $stmt->fetch();

$userId = null;
if (!$user) {
    $stmt = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, NULL, "student")');
    $stmt->execute([$name, $email]);
    $userId = $db->lastInsertId();
} else {
    $userId = $user['id'];
}

// Generate a secure one-time login token
$loginToken = bin2hex(random_bytes(32));

// Store token in database
$stmt = $db->prepare('INSERT INTO mobile_tokens (token, user_id) VALUES (?, ?)');
$stmt->execute([$loginToken, $userId]);

echo json_encode(['success' => true, 'token' => $loginToken]);
