<?php

/**
 * Tests for MenuBadges (no OJS needed): php dev/test/menuBadges.test.php
 */

require __DIR__ . '/../../classes/MenuBadges.php';

use APP\plugins\generic\dashboardCollapse\classes\MenuBadges;

$failures = 0;
function check(string $label, $actual, $expected): void
{
    global $failures;
    if ($actual === $expected) {
        echo "ok   {$label}\n";
    } else {
        $failures++;
        echo "FAIL {$label}\n  expected: " . var_export($expected, true) . "\n  actual:   " . var_export($actual, true) . "\n";
    }
}

$menu = MenuBadges::apply([
    'dossiers' => ['name' => 'My dossiers (2)', 'url' => 'u', 'icon' => 'Catalog'],
    'plain' => ['name' => 'Settings', 'submenu' => [
        'a' => ['name' => 'Journal'],
        'b' => ['name' => 'Offene Beiträge  (12) ', 'url' => 'u'],
    ]],
    'kept' => ['name' => 'Tasks (3)', 'badge' => ['slot' => '5']],
    'notCount' => ['name' => 'Reports (beta)'],
    'middle' => ['name' => 'A (1) B'],
    'onlyNumber' => ['name' => '(4)'],
    'zero' => ['name' => 'Queue (0)'],
    'notArray' => 'x',
]);

check('count moved into badge', $menu['dossiers']['name'], 'My dossiers');
check('badge slot', $menu['dossiers']['badge'], ['slot' => '2']);
check('other keys kept', [$menu['dossiers']['url'], $menu['dossiers']['icon']], ['u', 'Catalog']);
check('name without count unchanged', $menu['plain']['name'], 'Settings');
check('no badge without count', isset($menu['plain']['badge']), false);
check('submenu: unchanged entry', $menu['plain']['submenu']['a'], ['name' => 'Journal']);
check('submenu: count moved, spaces trimmed', $menu['plain']['submenu']['b']['name'], 'Offene Beiträge');
check('submenu: badge', $menu['plain']['submenu']['b']['badge'], ['slot' => '12']);
check('existing badge wins', $menu['kept'], ['name' => 'Tasks (3)', 'badge' => ['slot' => '5']]);
check('text in parentheses unchanged', $menu['notCount'], ['name' => 'Reports (beta)']);
check('count in the middle unchanged', $menu['middle'], ['name' => 'A (1) B']);
check('name of only a count unchanged', $menu['onlyNumber'], ['name' => '(4)']);
check('zero is a count', $menu['zero'], ['name' => 'Queue', 'badge' => ['slot' => '0']]);
check('order kept', array_keys($menu), ['dossiers', 'plain', 'kept', 'notCount', 'middle', 'onlyNumber', 'zero', 'notArray']);
check('non-array entry untouched', $menu['notArray'], 'x');

exit($failures ? 1 : 0);
