// src/components/Layout/SideMenu.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Menu } from 'antd';
import { SIDE_MENU_CONFIG, buildAuthorizedMenuItems, SideMenuItem } from '../../constants/sideMenu.config';
import SystemSettingService from '../../services/systemSettingService';

/* =======================
   Types
======================= */

export interface User {
  roles?: string[];
}

interface SideMenuProps {
  user?: User;
  setCurrentView: (view: string) => void;
  currentView?: string;
}

/** Return the top-level group key whose subtree contains the given view */
const findGroupKey = (
  menus: SideMenuItem[],
  targetView: string,
): string | undefined => {
  for (const menu of menus) {
    if (!menu.children) continue;
    const inSubtree = (items: SideMenuItem[]): boolean =>
      items.some((item) => item.view === targetView || (item.children ? inSubtree(item.children) : false));
    if (inSubtree(menu.children)) return menu.key;
  }
  return undefined;
};

/* =======================
   Component
======================= */

const SideMenu: React.FC<SideMenuProps> = ({ user, setCurrentView, currentView }) => {
  const roles = user?.roles ?? [];
  const [enabledFlags, setEnabledFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    SystemSettingService.getSettings()
      .then((s) => setEnabledFlags({
        nongyne_slide_dispatch_enabled: s.nongyne_slide_dispatch_enabled ?? true,
        enable_tissue_processing_workflow: s.enable_tissue_processing_workflow ?? true,
      }))
      .catch(() => {});
  }, []);

  const menuItems = useMemo(
    () => buildAuthorizedMenuItems(SIDE_MENU_CONFIG, roles, enabledFlags),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles.join(','), enabledFlags],
  );

  const [openKeys, setOpenKeys] = useState<string[]>(() => {
    if (!currentView) return [];
    const gk = findGroupKey(SIDE_MENU_CONFIG as SideMenuItem[], currentView);
    return gk ? [gk] : [];
  });

  // Auto-open the parent group whenever the active view changes
  useEffect(() => {
    if (!currentView) return;
    const gk = findGroupKey(SIDE_MENU_CONFIG as SideMenuItem[], currentView);
    if (gk) setOpenKeys((prev) => (prev.includes(gk) ? prev : [...prev, gk]));
  }, [currentView]);

  return (
    <Menu
      theme="light"
      mode="inline"
      items={menuItems}
      selectedKeys={currentView ? [currentView] : ['dashboard']}
      openKeys={openKeys}
      onOpenChange={setOpenKeys}
      onClick={({ key }) => setCurrentView(key)}
    />
  );
};

export default SideMenu;
