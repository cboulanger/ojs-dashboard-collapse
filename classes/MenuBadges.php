<?php

/**
 * @file plugins/generic/dashboardCollapse/classes/MenuBadges.php
 *
 * Distributed under the GNU GPL v3. For full terms see the file LICENSE.
 *
 * @class MenuBadges
 *
 * @brief Moves a count at the end of a menu entry's name, e.g. "My dossiers (2)",
 *  into a badge: name "My dossiers", badge "2". OJS's side menu shows badges next
 *  to the icon, so the count stays visible when the menu is collapsed to icons.
 *
 *  Pure function on the "menu" state of the backend pages; no OJS classes needed,
 *  so it can be tested on its own (dev/test/menuBadges.test.php).
 */

namespace APP\plugins\generic\dashboardCollapse\classes;

class MenuBadges
{
    /** A name that ends in a number in parentheses: "Name (12)" */
    public const COUNT_PATTERN = '/^(.*\S)\s*\((\d+)\)\s*$/us';

    /**
     * The menu with the counts in the names of its entries, at any level, moved
     * into badges. Entries that already have a badge are left as they are.
     *
     * @param array $menu Entries by key: ['name' => ..., 'url' => ..., 'submenu' => [...], 'badge' => [...]]
     */
    public static function apply(array $menu): array
    {
        foreach ($menu as $key => $entry) {
            if (!is_array($entry)) {
                continue;
            }
            if (isset($entry['submenu']) && is_array($entry['submenu'])) {
                $entry['submenu'] = self::apply($entry['submenu']);
            }
            if (!isset($entry['badge']) && is_string($entry['name'] ?? null)
                && preg_match(self::COUNT_PATTERN, $entry['name'], $matches)) {
                $entry['name'] = $matches[1];
                $entry['badge'] = ['slot' => $matches[2]];
            }
            $menu[$key] = $entry;
        }
        return $menu;
    }
}
