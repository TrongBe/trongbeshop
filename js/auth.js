/**
 * auth.js — TRONEX Firebase Google Authentication
 * Xử lý đăng nhập Google, trạng thái auth, và UI header
 */
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getDatabase,
    ref,
    set,
    get
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyAAEI9nMEMfUwbGbPHTyGRJ2dAfBRW7_Fo",
    authDomain: "hoctaptructuyen-7c09a.firebaseapp.com",
    projectId: "hoctaptructuyen-7c09a",
    storageBucket: "hoctaptructuyen-7c09a.firebasestorage.app",
    messagingSenderId: "329551572068",
    appId: "1:329551572068:web:41b7b3174ef45a77008371",
    databaseURL: "https://hoctaptructuyen-7c09a-default-rtdb.firebaseio.com"
};

// Tránh khởi tạo trùng
const firebaseApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getDatabase(firebaseApp);
const provider = new GoogleAuthProvider();

// ──────────────────────────────────────────────
//  ĐĂNG NHẬP / ĐĂNG XUẤT
// ──────────────────────────────────────────────

export async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            console.error('[Auth] Lỗi đăng nhập:', err.message);
            alert('Đăng nhập thất bại: ' + err.message);
        }
        return null;
    }
}

export async function signOutUser() {
    try {
        await signOut(auth);
        localStorage.removeItem('tronex_uid');
        localStorage.removeItem('tronex_user');
    } catch (err) {
        console.error('[Auth] Lỗi đăng xuất:', err);
    }
}

export function getCurrentUser() {
    return auth.currentUser;
}

// ──────────────────────────────────────────────
//  PROFILE — LƯU / ĐỌC THÔNG TIN TÀI KHOẢN
// ──────────────────────────────────────────────

export async function saveUserProfile(uid, profileData) {
    try {
        await set(ref(db, `users/${uid}/profile`), profileData);
        // Cũng lưu localStorage để đọc offline
        localStorage.setItem('tronex_user', JSON.stringify({ uid, ...profileData }));
    } catch (e) {
        console.warn('[Auth] Không thể lưu profile lên Firebase:', e);
        localStorage.setItem('tronex_user', JSON.stringify({ uid, ...profileData }));
    }
}

export async function loadUserProfile(uid) {
    try {
        const snap = await get(ref(db, `users/${uid}/profile`));
        if (snap.exists()) return snap.val();
    } catch (e) { }
    // Fallback localStorage
    try {
        const local = JSON.parse(localStorage.getItem('tronex_user') || 'null');
        if (local?.uid === uid) return local;
    } catch (e) { }
    return null;
}

// ──────────────────────────────────────────────
//  CẬP NHẬT UI HEADER
// ──────────────────────────────────────────────

function updateHeaderUI(user) {
    const authBtn = document.getElementById('authBtn');
    const authAvatar = document.getElementById('authAvatar');
    const authName = document.getElementById('authName');

    if (!authBtn) return;

    if (user) {
        // Đã đăng nhập: hiển thị avatar + tên
        const displayName = user.displayName || user.email?.split('@')[0] || 'Bạn';
        const photoURL = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff`;

        authBtn.innerHTML = `
            <img src="${photoURL}" alt="${displayName}" class="header-avatar"
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=6366f1&color=fff'">
            <span class="header-username">${displayName.split(' ').pop()}</span>
        `;
        authBtn.className = 'auth-btn auth-btn--logged';
        authBtn.title = 'Tài khoản của bạn';
        authBtn.onclick = () => { window.location.href = 'profile.html'; };

        if (authAvatar) authAvatar.src = photoURL;
        if (authName) authName.textContent = displayName;
    } else {
        // Chưa đăng nhập
        authBtn.innerHTML = `<span>🔑</span><span>Đăng nhập</span>`;
        authBtn.className = 'auth-btn';
        authBtn.title = 'Đăng nhập bằng Google';
        authBtn.onclick = signInWithGoogle;
    }
}

// ──────────────────────────────────────────────
//  LẮNG NGHE TRẠNG THÁI AUTH
// ──────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
    window.__tronexCurrentUser = user || null;

    if (user) {
        localStorage.setItem('tronex_uid', user.uid);

        // Load profile đã lưu (tên tùy chỉnh, SĐT, v.v.)
        const profile = await loadUserProfile(user.uid);
        const merged = {
            uid: user.uid,
            displayName: profile?.displayName || user.displayName || '',
            photoURL: profile?.photoURL || user.photoURL || '',
            email: user.email,
            phone: profile?.phone || '',
            birthday: profile?.birthday || ''
        };
        window.__tronexCurrentUser = { ...user, ...merged };
        localStorage.setItem('tronex_user', JSON.stringify(merged));
    } else {
        localStorage.removeItem('tronex_uid');
        window.__tronexCurrentUser = null;
    }

    updateHeaderUI(window.__tronexCurrentUser);

    // Reload quiz list khi auth thay đổi (ảnh hưởng đề riêng tư)
    if (typeof window.__initQuizList === 'function') {
        if (typeof window.loadCustomQuizzesFromStorage === 'function') {
            window.loadCustomQuizzesFromStorage();
        }
        window.__initQuizList();
    }
});

// Export ra window để HTML inline có thể gọi
window.signInWithGoogle = signInWithGoogle;
window.signOutUser = signOutUser;
window.getCurrentUser = getCurrentUser;

export { auth };
