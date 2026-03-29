<?php
require_once 'config.php';

$email = 'admin@class.lk';
$password = 'admin123';

try {
    $db = getDB();
    $stmt = $db->prepare('SELECT id, name, password_hash, role FROM users WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        echo "User not found\n";
    } else {
        echo "User found: " . $user['name'] . " (Role: " . $user['role'] . ")\n";
        if (password_verify($password, $user['password_hash'])) {
            echo "Password matched!\n";
        } else {
            echo "Password NOT matched.\n";
            echo "Actual Hash: " . $user['password_hash'] . "\n";
            echo "Expected Hash for '$password': " . password_hash($password, PASSWORD_BCRYPT) . "\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
