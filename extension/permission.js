const msg = document.getElementById('msg');
document.getElementById('allow').addEventListener('click', async () => {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    await chrome.storage.local.set({ enabled: true });
    msg.textContent = 'Listo. Ya puedes cerrar esta pestaña y abrir TikTok.';
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    msg.textContent = e.name === 'NotAllowedError'
      ? 'Permiso denegado. Actívalo en el candado de la barra de direcciones o en la configuración de sitios del navegador.'
      : 'No se pudo abrir la cámara: ' + e.message;
  }
});
