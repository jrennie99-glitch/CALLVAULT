import { ROLE_HIERARCHY, AdminRole, ALL_PERMISSIONS } from '@shared/schema';
import { storage } from './storage';

export type Permission = typeof ALL_PERMISSIONS[number];

const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  user: [],
  support: [
    'users.read',
    'audit.read',
  ],
  admin: [
    'users.read', 'users.write', 'users.suspend',
    'access.grant', 'access.revoke', 'access.trials',
    'billing.read',
    'security.read',
    'audit.read',
    'rate_limits.manage',
  ],
  super_admin: [
    'users.read', 'users.write', 'users.suspend', 'users.impersonate',
    'access.grant', 'access.revoke', 'access.trials',
    'admins.read', 'admins.manage',
    'billing.read', 'billing.write',
    'security.read', 'security.write',
    'audit.read', 'audit.export',
    'rate_limits.manage', 'blocklist.manage',
  ],
  ultra_god_admin: ALL_PERMISSIONS as unknown as Permission[],
  founder: ALL_PERMISSIONS as unknown as Permission[],
};

export class RBAC {
  static getRoleLevel(role: string): number {
    const index = ROLE_HIERARCHY.indexOf(role as AdminRole);
    return index >= 0 ? index : 0;
  }

  static isRoleHigherOrEqual(role1: string, role2: string): boolean {
    return this.getRoleLevel(role1) >= this.getRoleLevel(role2);
  }

  static isRoleHigher(role1: string, role2: string): boolean {
    return this.getRoleLevel(role1) > this.getRoleLevel(role2);
  }

  static getRolePermissions(role: AdminRole): Permission[] {
    return ROLE_PERMISSIONS[role] || [];
  }

  static async getUserEffectivePermissions(address: string): Promise<Permission[]> {
    const identity = await storage.getIdentity(address);
    if (!identity) return [];

    const role = identity.role as AdminRole;
    const rolePerms = this.getRolePermissions(role);

    if (role === 'ultra_god_admin' || role === 'founder') {
      return ALL_PERMISSIONS as unknown as Permission[];
    }

    const adminPerms = await storage.getAdminPermissions(address);
    if (!adminPerms) return rolePerms;

    if (adminPerms.expiresAt && new Date(adminPerms.expiresAt) < new Date()) {
      return rolePerms;
    }

    const customPerms = (adminPerms.permissions || []) as Permission[];
    const combined = new Set([...rolePerms, ...customPerms]);
    return Array.from(combined) as Permission[];
  }

  static async hasPermission(address: string, permission: Permission): Promise<boolean> {
    const identity = await storage.getIdentity(address);
    if (!identity) return false;

    if (identity.role === 'ultra_god_admin' || identity.role === 'founder') return true;

    if (identity.status !== 'active') return false;

    if (identity.adminExpiresAt && new Date(identity.adminExpiresAt) < new Date()) {
      return false;
    }

    const perms = await this.getUserEffectivePermissions(address);
    return perms.includes(permission);
  }

  static async hasAnyPermission(address: string, permissions: Permission[]): Promise<boolean> {
    for (const perm of permissions) {
      if (await this.hasPermission(address, perm)) {
        return true;
      }
    }
    return false;
  }

  static async hasAllPermissions(address: string, permissions: Permission[]): Promise<boolean> {
    for (const perm of permissions) {
      if (!(await this.hasPermission(address, perm))) {
        return false;
      }
    }
    return true;
  }

  static async canManageRole(actorAddress: string, targetRole: AdminRole): Promise<boolean> {
    const actor = await storage.getIdentity(actorAddress);
    if (!actor) return false;

    const actorLevel = this.getRoleLevel(actor.role);
    const targetLevel = this.getRoleLevel(targetRole);

    return actorLevel > targetLevel;
  }

  static async canEditUser(actorAddress: string, targetAddress: string): Promise<boolean> {
    if (actorAddress === targetAddress) return true;

    const actor = await storage.getIdentity(actorAddress);
    const target = await storage.getIdentity(targetAddress);

    if (!actor || !target) return false;

    if (target.role === 'ultra_god_admin') return false;

    return this.isRoleHigher(actor.role, target.role);
  }

  static isAdminRole(role: string): boolean {
    return ['support', 'admin', 'super_admin', 'ultra_god_admin', 'founder'].includes(role);
  }

  static async isOwner(address: string): Promise<boolean> {
    const identity = await storage.getIdentity(address);
    return identity?.role === 'ultra_god_admin' || identity?.role === 'founder';
  }

  static async requiresReauth(actionType: string): Promise<boolean> {
    const criticalActions = [
      'SUSPEND_USER', 'DELETE_USER', 'ROLE_CHANGE_ADMIN',
      'GRANT_ADMIN', 'REVOKE_ADMIN', 'SYSTEM_SETTING_CHANGE',
      'MASS_ACTION', 'MAINTENANCE_MODE', 'EXPORT_DATA'
    ];
    return criticalActions.includes(actionType);
  }
}

export const rbac = RBAC;
