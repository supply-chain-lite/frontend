import * as bootstrap from 'bootstrap/dist/js/bootstrap.bundle.min.js';
window.bootstrap = bootstrap;
import '../../../scss/styles.scss';
import '../../../common/css/custom.css';
import '../css/main.css';
import api from '../../../common/js/api.js';
import {
  saveRedirectUrl,
  handleAccessControlRedirect,
  currentPageUrl,
} from '../../../common/js/auth.js';
import { bsToastError } from '../../../common/js/bsToast.js';
import { ready } from '../../../common/js/dom.js';
import { initApp } from './app.js';

ready(async () => {
  const params = new URLSearchParams(window.location.search);

  const projectName = params.get('project');
  if (!projectName) {
    bsToastError('No project specified. Please provide ?project=name in the URL.');
    return;
  }

  const modelName = params.get('model');
  if (!modelName) {
    bsToastError('No model specified. Please provide ?model=name in the URL.');
    return;
  }

  document.title = `SQL Client - ${projectName} > ${modelName}`;

  try {
    const user = await api.post('/auth/me', { page_url: currentPageUrl() }, { silent: true });
    if (user && user.role_name) {
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

  await initApp({ projectName, modelName });
});
