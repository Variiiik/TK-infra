"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = hasPermission;
exports.hasAnyPermission = hasAnyPermission;
exports.hasAllPermissions = hasAllPermissions;
exports.generateId = generateId;
exports.formatDuration = formatDuration;
exports.formatRelativeTime = formatRelativeTime;
exports.truncate = truncate;
exports.slugify = slugify;
exports.capitalize = capitalize;
exports.getInitials = getInitials;
exports.isValidEmail = isValidEmail;
exports.isValidPassword = isValidPassword;
exports.isValidIPv4 = isValidIPv4;
exports.buildQueryString = buildQueryString;
exports.detectOS = detectOS;
exports.getOSLabel = getOSLabel;
exports.groupBy = groupBy;
exports.unique = unique;
exports.deepClone = deepClone;
exports.sleep = sleep;
exports.retry = retry;
const constants_1 = require("../constants");
// ─── Permission Utilities ─────────────────────────────────────────
function hasPermission(role, permission) {
    return constants_1.ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
function hasAnyPermission(role, permissions) {
    return permissions.some(p => hasPermission(role, p));
}
function hasAllPermissions(role, permissions) {
    return permissions.every(p => hasPermission(role, p));
}
// ─── ID Generation ────────────────────────────────────────────────
function generateId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 9);
    return `${timestamp}${random}`;
}
// ─── Date Utilities ───────────────────────────────────────────────
function formatDuration(seconds) {
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60)
        return `${minutes}m ${remainingSeconds}s`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}
function formatRelativeTime(date) {
    const now = Date.now();
    const diff = now - new Date(date).getTime();
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60)
        return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30)
        return `${days}d ago`;
    return new Date(date).toLocaleDateString();
}
// ─── String Utilities ─────────────────────────────────────────────
function truncate(str, maxLength) {
    if (str.length <= maxLength)
        return str;
    return `${str.slice(0, maxLength - 3)}...`;
}
function slugify(str) {
    return str
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
function getInitials(name) {
    return name
        .split(' ')
        .map(part => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('');
}
// ─── Validation Utilities ─────────────────────────────────────────
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function isValidPassword(password) {
    return password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /[0-9]/.test(password);
}
function isValidIPv4(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4)
        return false;
    return parts.every(p => {
        const n = parseInt(p, 10);
        return !isNaN(n) && n >= 0 && n <= 255;
    });
}
// ─── Network Utilities ────────────────────────────────────────────
function buildQueryString(params) {
    const filtered = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return filtered.length ? `?${filtered.join('&')}` : '';
}
// ─── OS Detection ─────────────────────────────────────────────────
function detectOS() {
    if (typeof navigator === 'undefined')
        return 'unknown';
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win'))
        return 'windows';
    if (ua.includes('mac'))
        return 'macos';
    if (ua.includes('linux'))
        return 'linux';
    return 'unknown';
}
function getOSLabel(os) {
    const labels = {
        windows: 'Windows',
        macos: 'macOS',
        linux: 'Linux',
        android: 'Android',
        ios: 'iOS',
        unknown: 'Unknown',
    };
    return labels[os] ?? 'Unknown';
}
// ─── Array Utilities ──────────────────────────────────────────────
function groupBy(arr, key) {
    return arr.reduce((acc, item) => {
        const group = String(item[key]);
        if (!acc[group])
            acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {});
}
function unique(arr) {
    return [...new Set(arr)];
}
// ─── Deep Clone ───────────────────────────────────────────────────
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
// ─── Sleep ────────────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ─── Retry ────────────────────────────────────────────────────────
async function retry(fn, attempts, delayMs) {
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        }
        catch (err) {
            if (i === attempts - 1)
                throw err;
            await sleep(delayMs * Math.pow(2, i));
        }
    }
    throw new Error('Retry failed');
}
