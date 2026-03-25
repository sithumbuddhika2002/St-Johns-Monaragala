<?php
require_once __DIR__ . '/../config.php';

$action = $_GET['action'] ?? '';

switch ($action) {

    // ======== SAVE AVAILABILITY ========
    case 'save':
        requireLogin();
        $data = getInput();
        $year = intval($data['year'] ?? date('Y'));
        $week = intval($data['week'] ?? date('W'));
        $days = $data['days'] ?? []; // array of {day: 0-6, is_free: 0|1}

        if (empty($days)) {
            jsonResponse(['error' => 'No days provided'], 400);
        }

        $db = getDB();
        $stmt = $db->prepare(
            'INSERT INTO availability (user_id, year, week_number, day_of_week, is_free)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE is_free = VALUES(is_free), updated_at = NOW()'
        );

        foreach ($days as $d) {
            $dayNum = intval($d['day']);
            $isFree = intval($d['is_free']) ? 1 : 0;
            if ($dayNum < 0 || $dayNum > 6) continue;
            $stmt->execute([$_SESSION['user_id'], $year, $week, $dayNum, $isFree]);
        }

        jsonResponse(['success' => true]);
        break;

    // ======== GET MY AVAILABILITY ========
    case 'my':
        requireLogin();
        $year = intval($_GET['year'] ?? date('Y'));
        $week = intval($_GET['week'] ?? date('W'));

        $db = getDB();
        $stmt = $db->prepare(
            'SELECT day_of_week, is_free FROM availability WHERE user_id = ? AND year = ? AND week_number = ?'
        );
        $stmt->execute([$_SESSION['user_id'], $year, $week]);
        $rows = $stmt->fetchAll();

        // Build a 7-element array
        $result = array_fill(0, 7, 0);
        foreach ($rows as $r) {
            $result[intval($r['day_of_week'])] = intval($r['is_free']);
        }

        jsonResponse(['year' => $year, 'week' => $week, 'days' => $result]);
        break;

    // ======== ALL (admin) ========
    case 'all':
        requireAdmin();
        $year = intval($_GET['year'] ?? date('Y'));
        $week = intval($_GET['week'] ?? date('W'));

        $db = getDB();
        $stmt = $db->prepare(
            'SELECT u.id AS user_id, u.name, a.day_of_week, a.is_free
             FROM users u
             LEFT JOIN availability a ON a.user_id = u.id AND a.year = ? AND a.week_number = ?
             WHERE u.role = "student"
             ORDER BY u.name, a.day_of_week'
        );
        $stmt->execute([$year, $week]);
        $rows = $stmt->fetchAll();

        $students = [];
        foreach ($rows as $r) {
            $uid = $r['user_id'];
            if (!isset($students[$uid])) {
                $students[$uid] = ['id' => $uid, 'name' => $r['name'], 'days' => array_fill(0, 7, 0)];
            }
            if ($r['day_of_week'] !== null) {
                $students[$uid]['days'][intval($r['day_of_week'])] = intval($r['is_free']);
            }
        }

        jsonResponse(['year' => $year, 'week' => $week, 'students' => array_values($students)]);
        break;

    default:
        jsonResponse(['error' => 'Unknown action'], 400);
}
