import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';

export async function signInWithDevice(api, mode, fields) {
  if (!browserSupportsWebAuthn()) throw new Error('当前浏览器无法确认设备。可以在手机浏览器中打开禾伴，或跳过登录。');
  const { options } = await api('/api/auth/options', 'POST', { mode, ...fields });
  let response;
  try {
    const confirm = mode === 'create' ? startRegistration : startAuthentication;
    response = await confirm({ optionsJSON: options });
  } catch (error) {
    if (error.name === 'InvalidStateError') throw new Error('此设备已有凭据，请尝试用邮箱登录。');
    throw new Error('设备确认未完成。您可以再试一次，或在手机浏览器中打开禾伴。');
  }
  await api('/api/auth/verify', 'POST', { challenge: options.challenge, response });
}
