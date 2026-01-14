// ============================================
// HYBRID ENCRYPTION EXPLORER - JavaScript
// FIXED: Response body can only be read once
// ============================================

let publicKey = null;
let privateKey = null;
let encryptedData = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showMessage(elementId, text, type) {
    const msgEl = document.getElementById(elementId);
    msgEl.textContent = text;
    msgEl.className = `message show ${type}`;
    setTimeout(() => msgEl.classList.remove('show'), 5000);
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    const text = element.textContent;
    navigator.clipboard.writeText(text).then(() => {
        showMessage('encryptMessage', 'Copied to clipboard!', 'success');
    });
}

function switchTab(event, tabName) {
    const buttons = event.target.parentElement.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');
    buttons.forEach(btn => btn.classList.remove('active'));
    contents.forEach(content => content.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

// ============================================
// ENCRYPTION & DECRYPTION FUNCTIONS
// ============================================

async function generateKeys() {
    try {
        showMessage('encryptMessage', 'Generating RSA-2048 key pair...', 'info');
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        );
        publicKey = keyPair.publicKey;
        privateKey = keyPair.privateKey;
        const pubKeyJwk = await window.crypto.subtle.exportKey('jwk', publicKey);
        const privKeyJwk = await window.crypto.subtle.exportKey('jwk', privateKey);
        document.getElementById('publicKeyDisplay').textContent = JSON.stringify(pubKeyJwk, null, 2);
        document.getElementById('privateKeyDisplay').textContent = JSON.stringify(privKeyJwk, null, 2);
        showMessage('encryptMessage', '✓ RSA-2048 key pair generated successfully!', 'success');
    } catch (error) {
        showMessage('encryptMessage', 'Error: ' + error.message, 'error');
    }
}

async function encryptMessage() {
    if (!publicKey) {
        showMessage('encryptMessage', 'Please generate RSA keys first!', 'error');
        return;
    }
    const plaintext = document.getElementById('plaintextInput').value;
    if (!plaintext) {
        showMessage('encryptMessage', 'Please enter a message.', 'error');
        return;
    }
    try {
        const startTime = performance.now();
        const aesKey = window.crypto.getRandomValues(new Uint8Array(32));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const aesKeyObj = await window.crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
        const plaintextBytes = new TextEncoder().encode(plaintext);
        const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKeyObj, plaintextBytes);
        const encryptedAesKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, aesKey);
        encryptedData = {
            algorithm: 'AES-256-GCM with RSA-2048-OAEP',
            encryptedSymmetricKey: arrayBufferToBase64(encryptedAesKey),
            iv: arrayBufferToBase64(iv),
            ciphertext: arrayBufferToBase64(ciphertext),
            timestamp: new Date().toISOString()
        };
        const endTime = performance.now();
        document.getElementById('encryptedOutput').textContent = JSON.stringify(encryptedData, null, 2);
        document.getElementById('encryptStats').style.display = 'grid';
        document.getElementById('originalSize').textContent = formatBytes(plaintextBytes.byteLength);
        document.getElementById('encryptedSize').textContent = formatBytes(
            base64ToArrayBuffer(encryptedData.ciphertext).byteLength +
            base64ToArrayBuffer(encryptedData.encryptedSymmetricKey).byteLength
        );
        document.getElementById('encryptTime').textContent = Math.round(endTime - startTime) + ' ms';
        showMessage('encryptMessage', '✓ Message encrypted successfully!', 'success');
    } catch (error) {
        showMessage('encryptMessage', 'Encryption error: ' + error.message, 'error');
    }
}

async function decryptMessage() {
    if (!privateKey) {
        showMessage('decryptMessage', 'Please generate RSA keys first!', 'error');
        return;
    }
    const encryptedInput = document.getElementById('encryptedInput').value;
    if (!encryptedInput) {
        showMessage('decryptMessage', 'Please paste an encrypted package.', 'error');
        return;
    }
    try {
        const startTime = performance.now();
        const encData = JSON.parse(encryptedInput);
        const encryptedAesKeyBuffer = base64ToArrayBuffer(encData.encryptedSymmetricKey);
        const aesKeyBuffer = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedAesKeyBuffer);
        const aesKeyObj = await window.crypto.subtle.importKey('raw', aesKeyBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
        const ivBuffer = base64ToArrayBuffer(encData.iv);
        const ciphertextBuffer = base64ToArrayBuffer(encData.ciphertext);
        const plaintextBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, aesKeyObj, ciphertextBuffer);
        const plaintext = new TextDecoder().decode(plaintextBuffer);
        const endTime = performance.now();
        document.getElementById('decryptedOutput').textContent = plaintext;
        document.getElementById('decryptStats').style.display = 'grid';
        document.getElementById('decryptTime').textContent = Math.round(endTime - startTime) + ' ms';
        document.getElementById('authStatus').textContent = 'Verified ✓';
        document.getElementById('integrityStatus').textContent = 'OK ✓';
        document.getElementById('keyStatus').textContent = 'Success ✓';
        showMessage('decryptMessage', '✓ Message decrypted! Integrity verified.', 'success');
    } catch (error) {
        showMessage('decryptMessage', 'Decryption error: ' + error.message, 'error');
    }
}

// ============================================
// KEY MANAGEMENT FUNCTIONS
// ============================================

async function downloadPrivateKey() {
    if (!privateKey) {
        showMessage('encryptMessage', 'Generate keys first!', 'error');
        return;
    }
    const keyData = await window.crypto.subtle.exportKey('pkcs8', privateKey);
    const keyString = arrayBufferToBase64(keyData);
    downloadFile(keyString, 'private-key.pem', 'text/plain');
}

function downloadPublicKey() {
    if (!publicKey) {
        showMessage('encryptMessage', 'Generate keys first!', 'error');
        return;
    }
    const pubKeyEl = document.getElementById('publicKeyDisplay');
    downloadFile(pubKeyEl.textContent, 'public-key.json', 'application/json');
}

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

// ============================================
// CLEAR FUNCTIONS
// ============================================

function clearEncrypt() {
    document.getElementById('plaintextInput').value = '';
    document.getElementById('encryptedOutput').textContent = 'Encrypted data will appear here...';
    document.getElementById('encryptStats').style.display = 'none';
    encryptedData = null;
}

function clearDecrypt() {
    document.getElementById('encryptedInput').value = '';
    document.getElementById('decryptedOutput').textContent = 'Decrypted message will appear here...';
    document.getElementById('decryptStats').style.display = 'none';
}

// ============================================
// ONE-TIME LINKS FUNCTIONS (FIXED)
// ============================================

async function createSelfDestructLink() {
    const message = document.getElementById('selfDestructMessage').value;
    const ttlMinutes = document.getElementById('ttlMinutes').value || 60;
    if (!message) {
        showMessage('linkCreationMessage', 'Please enter a message.', 'error');
        return;
    }
    if (!publicKey) {
        showMessage('linkCreationMessage', 'Please generate RSA keys first!', 'error');
        return;
    }
    try {
        showMessage('linkCreationMessage', 'Encrypting and uploading...', 'info');
        const aesKey = window.crypto.getRandomValues(new Uint8Array(32));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const aesKeyObj = await window.crypto.subtle.importKey('raw', aesKey, { name: 'AES-GCM' }, false, ['encrypt']);
        const plaintextBytes = new TextEncoder().encode(message);
        const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKeyObj, plaintextBytes);
        const encryptedAesKey = await window.crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, aesKey);
        const encryptedPackage = {
            algorithm: 'AES-256-GCM with RSA-2048-OAEP',
            encryptedSymmetricKey: arrayBufferToBase64(encryptedAesKey),
            iv: arrayBufferToBase64(iv),
            ciphertext: arrayBufferToBase64(ciphertext),
            timestamp: new Date().toISOString()
        };
        const res = await fetch('http://localhost:3000/api/secret', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encryptedPackage, ttlMinutes: parseInt(ttlMinutes) })
        });
        
        if (!res.ok) {
            throw new Error(`Server error (${res.status}): Check backend is running (node server.js)`);
        }
        
        const data = await res.json();
        document.getElementById('selfDestructLinkOutput').textContent = data.url;
        showMessage('linkCreationMessage', '✓ One-time link created! Expires in ' + ttlMinutes + ' minutes.', 'success');
    } catch (error) {
        console.error('Error creating self-destruct link:', error);
        showMessage('linkCreationMessage', '❌ Error: ' + error.message, 'error');
    }
}

async function openSelfDestructLink() {
    if (!privateKey) {
        showMessage('linkAccessMessage', 'Please generate RSA keys first!', 'error');
        return;
    }
    const url = document.getElementById('selfDestructLinkInput').value.trim();
    if (!url) {
        showMessage('linkAccessMessage', 'Please paste a link.', 'error');
        return;
    }
    try {
        showMessage('linkAccessMessage', 'Retrieving secret...', 'info');
        const parts = url.split('/');
        const id = parts[parts.length - 1];
        
        console.log('Fetching from:', `http://localhost:3000/api/secret/${id}`);
        
        const res = await fetch(`http://localhost:3000/api/secret/${id}`);
        
        if (!res.ok) {
            throw new Error(`Server error (${res.status}): Secret not found, expired, or already accessed | Is backend running?`);
        }
        
        let payload;
        try {
            payload = await res.json();
        } catch (jsonError) {
            console.error('JSON parse error:', jsonError);
            throw new Error(`Server response was not valid JSON. Is backend running correctly?`);
        }
        
        if (!payload.encryptedSymmetricKey || !payload.iv || !payload.ciphertext) {
            throw new Error('Invalid response format: missing encryption data');
        }
        
        const encryptedAesKeyBuffer = base64ToArrayBuffer(payload.encryptedSymmetricKey);
        const aesKeyBuffer = await window.crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, encryptedAesKeyBuffer);
        const aesKeyObj = await window.crypto.subtle.importKey('raw', aesKeyBuffer, { name: 'AES-GCM' }, false, ['decrypt']);
        const ivBuffer = base64ToArrayBuffer(payload.iv);
        const ciphertextBuffer = base64ToArrayBuffer(payload.ciphertext);
        const plaintextBuffer = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuffer }, aesKeyObj, ciphertextBuffer);
        const plaintext = new TextDecoder().decode(plaintextBuffer);
        document.getElementById('selfDestructMessageOutput').textContent = plaintext;
        document.getElementById('selfDestructLinkInput').value = '';
        showMessage('linkAccessMessage', '✓ Message decrypted! This link is now consumed.', 'success');
    } catch (error) {
        console.error('Error opening self-destruct link:', error);
        showMessage('linkAccessMessage', '❌ Error: ' + error.message, 'error');
    }
}

function clearSelfDestructSender() {
    document.getElementById('selfDestructMessage').value = '';
    document.getElementById('selfDestructLinkOutput').textContent = 'One-time link will appear here...';
}

function clearSelfDestructRecipient() {
    document.getElementById('selfDestructLinkInput').value = '';
    document.getElementById('selfDestructMessageOutput').textContent = 'Decrypted message will appear here...';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    if (encryptedData) {
        document.getElementById('encryptedInput').value = JSON.stringify(encryptedData, null, 2);
    }
});
