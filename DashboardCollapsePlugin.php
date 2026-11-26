<?php

/**
 * @file plugins/generic/dashboardCollapse/DashboardCollapsePlugin.php
 *
 * Distributed under the GNU GPL v3. For full terms see the file LICENSE.
 *
 * @class DashboardCollapsePlugin
 *
 * @brief Collapses the left menu of the backend pages to a narrow column of icons.
 *  A click on an icon opens the whole menu as a drawer over the page, which closes
 *  again when a link is chosen, the pointer leaves it, or on a click outside or
 *  Escape. Counts in the menu's names, e.g. "My dossiers (2)", become badges on
 *  the icons. A button at the top of the menu keeps it open (stored per browser).
 *
 *  Only styles and a script for the browser, and a change to the menu's data
 *  before the page is shown. No database tables, no settings.
 */

namespace APP\plugins\generic\dashboardCollapse;

use APP\core\Application;
use APP\plugins\generic\dashboardCollapse\classes\MenuBadges;
use APP\template\TemplateManager;
use PKP\plugins\GenericPlugin;
use PKP\plugins\Hook;

class DashboardCollapsePlugin extends GenericPlugin
{
    public function getName()
    {
        return 'DashboardCollapsePlugin';
    }

    public function getDisplayName()
    {
        return __('plugins.generic.dashboardCollapse.displayName');
    }

    public function getDescription()
    {
        return __('plugins.generic.dashboardCollapse.description');
    }

    public function register($category, $path, $mainContextId = null)
    {
        $success = parent::register($category, $path, $mainContextId);
        if ($success && $this->getEnabled($mainContextId)) {
            // Last, so that the menu entries of other plugins and of OJS itself are there
            Hook::add('TemplateManager::display', $this->collapseMenu(...), Hook::SEQUENCE_LAST);
        }
        return $success;
    }

    /**
     * On backend pages with the left menu: counts in the menu's names become badges,
     * and the script, styles and texts that collapse the menu are added.
     */
    public function collapseMenu(string $hookName, array $args): bool
    {
        $request = Application::get()->getRequest();
        if (!$request->getContext() || !$request->getUser()) {
            return false;
        }
        $templateMgr = $args[0]; /** @var TemplateManager $templateMgr */
        $menu = $templateMgr->getState('menu');
        if (!is_array($menu) || !$menu) {
            return false;
        }
        $templateMgr->setState(['menu' => MenuBadges::apply($menu)]);

        $base = $request->getBaseUrl() . '/' . $this->getPluginPath();
        $version = $this->getCurrentVersion()?->getVersionString() ?? '';
        $config = [
            'text' => [
                'keepOpen' => __('plugins.generic.dashboardCollapse.keepOpen'),
                'collapse' => __('plugins.generic.dashboardCollapse.collapse'),
            ],
        ];
        $options = ['contexts' => 'backend'];
        $templateMgr->addJavaScript(
            'dashboardCollapseConfig',
            'window.dashboardCollapseConfig = ' . json_encode($config, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP) . ';',
            $options + ['inline' => true]
        );
        $templateMgr->addJavaScript('dashboardCollapse', "{$base}/js/dashboardCollapse.js?v={$version}", $options);
        $templateMgr->addStyleSheet('dashboardCollapse', "{$base}/css/dashboardCollapse.css?v={$version}", $options);
        return false;
    }
}
