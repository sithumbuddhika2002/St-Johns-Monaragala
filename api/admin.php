<?php
require_once __DIR__ . '/../config.php';

$action = $_GET['action'] ?? '';

switch ($action) {

    // ======== BEST DAYS ========
    case 'best_days':
        requireAdmin();
        $year = intval($_GET['year'] ?? date('Y'));
        $week = intval($_GET['week'] ?? date('W'));

        $db = getDB();
        $stmt = $db->prepare(
            'SELECT day_of_week, SUM(is_free) AS free_count
             FROM availability
             WHERE year = ? AND week_number = ?
             GROUP BY day_of_week
             ORDER BY free_count DESC'
        );
        $stmt->execute([$year, $week]);
        $rows = $stmt->fetchAll();

        // Total student count
        $total = $db->query('SELECT COUNT(*) AS c FROM users WHERE role = "student"')->fetch()['c'];

        $days = [];
        foreach ($rows as $r) {
            $days[] = [
                'day'        => intval($r['day_of_week']),
                'free_count' => intval($r['free_count']),
                'total'      => intval($total),
                'percentage' => $total > 0 ? round($r['free_count'] / $total * 100, 1) : 0,
            ];
        }

        jsonResponse(['year' => $year, 'week' => $week, 'days' => $days]);
        break;

    // ======== WEEKLY SUMMARY ========
    case 'weekly_summary':
        requireAdmin();
        $year = intval($_GET['year'] ?? date('Y'));
        $week = intval($_GET['week'] ?? date('W'));

        $db = getDB();
        $stmt = $db->prepare(
            'SELECT day_of_week, SUM(is_free) AS free_count, COUNT(*) AS responded
             FROM availability
             WHERE year = ? AND week_number = ?
             GROUP BY day_of_week
             ORDER BY day_of_week'
        );
        $stmt->execute([$year, $week]);
        $rows = $stmt->fetchAll();

        $total = $db->query('SELECT COUNT(*) AS c FROM users WHERE role = "student"')->fetch()['c'];

        $summary = [];
        foreach ($rows as $r) {
            $summary[] = [
                'day'        => intval($r['day_of_week']),
                'free_count' => intval($r['free_count']),
                'responded'  => intval($r['responded']),
                'total'      => intval($total),
            ];
        }

        jsonResponse(['year' => $year, 'week' => $week, 'summary' => $summary, 'total_students' => intval($total)]);
        break;

    // ======== YEARLY SUMMARY (heatmap data) ========
    case 'yearly_summary':
        requireAdmin();
        $year = intval($_GET['year'] ?? date('Y'));

        $db = getDB();
        $stmt = $db->prepare(
            'SELECT week_number, day_of_week, SUM(is_free) AS free_count
             FROM availability
             WHERE year = ?
             GROUP BY week_number, day_of_week
             ORDER BY week_number, day_of_week'
        );
        $stmt->execute([$year]);
        $rows = $stmt->fetchAll();

        $total = $db->query('SELECT COUNT(*) AS c FROM users WHERE role = "student"')->fetch()['c'];

        $heatmap = [];
        foreach ($rows as $r) {
            $heatmap[] = [
                'week'       => intval($r['week_number']),
                'day'        => intval($r['day_of_week']),
                'free_count' => intval($r['free_count']),
                'total'      => intval($total),
            ];
        }

        jsonResponse(['year' => $year, 'heatmap' => $heatmap, 'total_students' => intval($total)]);
        break;

    // ======== STUDENTS LIST ========
    case 'students':
        requireAdmin();
        $db = getDB();
        $stmt = $db->query('SELECT id, name, email, created_at FROM users WHERE role = "student" ORDER BY name');
        jsonResponse(['students' => $stmt->fetchAll()]);
        break;

    // ======== ADD ADMIN ========
    case 'add_admin':
        requireAdmin();
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
            jsonResponse(['error' => 'Email already exists'], 409);
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $db->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, "admin")');
        $stmt->execute([$name, $email, $hash]);

        jsonResponse(['success' => true]);
        break;

    default:
        jsonResponse(['error' => 'Unknown action'], 400);
}
