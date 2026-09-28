import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss';
import '../../../common/css/custom.css';
import '../css/main.css';
import api from '@/common/js/api';
import { saveRedirectUrl, handleAccessControlRedirect, currentPageUrl } from '@/common/js/auth';
import { ready } from '@/common/js/dom';

ready(async () => {
  let user;
  try {
    user = await api.post('/auth/me', { page_url: currentPageUrl() }, { silent: true });
    if (user && user.role_name) {
      sessionStorage.setItem('user', JSON.stringify(user));
      if (handleAccessControlRedirect(user)) return;
    } else {
      saveRedirectUrl();
      window.location.href = '/login.html';
      return;
    }
  } catch {
    saveRedirectUrl();
    window.location.href = '/login.html';
    return;
  }

  await import('./tree.js');
});
