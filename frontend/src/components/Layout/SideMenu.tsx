// src/components/Layout/SideMenu.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Menu } from 'antd';
import type { MenuProps } from 'antd';
import { SIDE_MENU_CONFIG, buildAuthorizedMenuItems } from '../../constants/sideMenu.config';
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

type BuiltItems = NonNullable<MenuProps['items']>;

const childrenOf = (item: BuiltItems[number]): BuiltItems | undefined =>
  item && 'children' in item && item.children ? (item.children as BuiltItems) : undefined;

/**
 * Top-level group, among the items this user is actually shown, that holds the
 * view. Searching the whole config instead picked the first group with the view
 * even when it was hidden: a pathologist on QC Review got Gyne Cytology opened
 * (which they cannot see) and their Diagnosis group left shut.
 */
export const findGroupKey = (items: BuiltItems, targetView: string): string | undefined => {
  const holds = (list: BuiltItems): boolean =>
    list.some((i) => {
      const kids = childrenOf(i);
      return i?.key === targetView || (kids ? holds(kids) : false);
    });
  for (const item of items) {
    const kids = childrenOf(item);
    if (kids && holds(kids)) return String(item!.key);
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
    const gk = findGroupKey(menuItems, currentView);
    return gk ? [gk] : [];
  });

  // Auto-open the parent group whenever the active view changes
  useEffect(() => {
    if (!currentView) return;
    const gk = findGroupKey(menuItems, currentView);
    if (gk) setOpenKeys((prev) => (prev.includes(gk) ? prev : [...prev, gk]));
  }, [currentView, menuItems]);

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
