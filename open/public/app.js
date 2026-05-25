const state = {
  user: null,
  versions: [],
  authMode: "login"
};

const nodes = {
  currentUser: document.querySelector("#current-user"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  passwordButton: document.querySelector("#password-button"),
  adminNav: document.querySelector("#admin-nav"),
  adminBand: document.querySelector("#admin"),
  versionsList: document.querySelector("#versions-list"),
  adminList: document.querySelector("#admin-list"),
  authDialog: document.querySelector("#auth-dialog"),
  authTitle: document.querySelector("#auth-title"),
  authUsername: document.querySelector("#auth-username"),
  authPassword: document.querySelector("#auth-password"),
  authMessage: document.querySelector("#auth-message"),
  authSubmit: document.querySelector("#auth-submit"),
  showLogin: document.querySelector("#show-login"),
  showRegister: document.querySelector("#show-register"),
  passwordDialog: document.querySelector("#password-dialog"),
  currentPassword: document.querySelector("#current-password"),
  newPassword: document.querySelector("#new-password"),
  passwordMessage: document.querySelector("#password-message"),
  passwordSubmit: document.querySelector("#password-submit"),
  newVersionButton: document.querySelector("#new-version-button"),
  versionDialog: document.querySelector("#version-dialog"),
  versionDialogTitle: document.querySelector("#version-dialog-title"),
  versionId: document.querySelector("#version-id"),
  versionNumber: document.querySelector("#version-number"),
  versionChannel: document.querySelector("#version-channel"),
  versionTitle: document.querySelector("#version-title"),
  versionDate: document.querySelector("#version-date"),
  versionNotes: document.querySelector("#version-notes"),
  versionPublished: document.querySelector("#version-published"),
  versionMessage: document.querySelector("#version-message"),
  versionSubmit: document.querySelector("#version-submit")
};

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...headers,
      ...(options.headers ?? {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? "Request failed.");
  }
  return payload;
}

function setMessage(node, message, ok = false) {
  node.textContent = message;
  node.classList.toggle("ok", ok);
}

function renderShell() {
  const isSignedIn = Boolean(state.user);
  const isAdmin = state.user?.role === "admin";

  nodes.currentUser.textContent = isSignedIn ? `${state.user.username} · ${state.user.role}` : "";
  nodes.loginButton.hidden = isSignedIn;
  nodes.logoutButton.hidden = !isSignedIn;
  nodes.passwordButton.hidden = !isSignedIn;
  nodes.adminNav.hidden = !isAdmin;
  nodes.adminBand.hidden = !isAdmin;
}

function renderVersions() {
  if (state.versions.length === 0) {
    nodes.versionsList.innerHTML = `<p class="empty-state">暂无可下载版本。</p>`;
    return;
  }

  nodes.versionsList.innerHTML = state.versions
    .map((version, index) => {
      const packages = version.packages.length
        ? version.packages
            .map(
              (pkg) => `
                <div class="package-row">
                  <div>
                    <div class="package-name">${escapeHtml(pkg.label || `${pkg.platform} ${pkg.arch}`)}</div>
                    <p class="package-meta">${escapeHtml(pkg.platform)} · ${escapeHtml(pkg.arch)} · ${formatBytes(pkg.size)} · ${escapeHtml(pkg.originalName)}</p>
                  </div>
                  <a class="primary" href="${escapeHtml(pkg.url)}" download>下载</a>
                </div>
              `
            )
            .join("")
        : `<p class="empty-state">安装包即将提供。</p>`;

      return `
        <article class="version-card ${index === 0 ? "latest" : ""}">
          <div class="version-header">
            <div>
              <div class="version-title">
                <h3>${escapeHtml(version.title)}</h3>
                ${index === 0 ? '<span class="badge stable">Latest</span>' : ""}
                <span class="badge ${escapeHtml(version.channel)}">${escapeHtml(version.channel)}</span>
                ${version.published ? "" : '<span class="badge">Draft</span>'}
              </div>
              <p class="package-meta">${escapeHtml(version.version)} · ${escapeHtml(version.releaseDate)}</p>
            </div>
          </div>
          <p class="version-notes">${escapeHtml(version.notes)}</p>
          <div class="package-list">${packages}</div>
        </article>
      `;
    })
    .join("");
}

function renderAdmin() {
  if (state.user?.role !== "admin") {
    return;
  }

  nodes.adminList.innerHTML = state.versions
    .map((version) => {
      const packages = version.packages
        .map(
          (pkg) => `
            <div class="package-row">
              <div>
                <div class="package-name">${escapeHtml(pkg.label)}</div>
                <p class="package-meta">${escapeHtml(pkg.originalName)} · ${formatBytes(pkg.size)}</p>
              </div>
              <button class="danger delete-package" data-version-id="${escapeHtml(version.id)}" data-package-id="${escapeHtml(pkg.id)}" type="button">删除</button>
            </div>
          `
        )
        .join("");

      return `
        <article class="admin-card">
          <div class="admin-header">
            <div>
              <h3>${escapeHtml(version.title)}</h3>
              <p class="package-meta">${escapeHtml(version.version)} · ${escapeHtml(version.channel)} · ${version.published ? "Published" : "Draft"}</p>
            </div>
            <div class="admin-actions">
              <button class="ghost edit-version" data-id="${escapeHtml(version.id)}" type="button">编辑</button>
              <button class="danger delete-version" data-id="${escapeHtml(version.id)}" type="button">删除</button>
            </div>
          </div>
          <div class="package-list">${packages || '<p class="empty-state">尚未上传安装包。</p>'}</div>
          <div class="upload-panel">
            <h4>上传此版本安装包</h4>
            <form class="upload-form" data-version-id="${escapeHtml(version.id)}">
              <label>
                平台
                <select name="platform">
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
                  <option value="linux">Linux</option>
                </select>
              </label>
              <label>
                架构
                <select name="arch">
                  <option value="x64">x64</option>
                  <option value="arm64">arm64</option>
                  <option value="universal">Universal</option>
                </select>
              </label>
              <label>
                显示名称
                <input name="label" placeholder="Windows x64 Installer" />
              </label>
              <label>
                安装包文件
                <input name="installer" type="file" />
              </label>
              <button class="primary upload-inline" type="submit">上传</button>
            </form>
          </div>
        </article>
      `;
    })
    .join("");
}

function render() {
  renderShell();
  renderVersions();
  renderAdmin();
}

async function refresh() {
  const [me, versions] = await Promise.all([api("/api/me"), api("/api/versions")]);
  state.user = me.user;
  state.versions = versions.versions;
  render();
}

function setAuthMode(mode) {
  state.authMode = mode;
  const isLogin = mode === "login";
  nodes.authTitle.textContent = isLogin ? "登录" : "注册";
  nodes.authSubmit.textContent = isLogin ? "登录" : "创建账号";
  nodes.showLogin.classList.toggle("active", isLogin);
  nodes.showRegister.classList.toggle("active", !isLogin);
  setMessage(nodes.authMessage, "");
}

function openVersionDialog(version = null) {
  nodes.versionDialogTitle.textContent = version ? "编辑版本" : "新增版本";
  nodes.versionId.value = version?.id ?? "";
  nodes.versionNumber.value = version?.version ?? "";
  nodes.versionChannel.value = version?.channel ?? "stable";
  nodes.versionTitle.value = version?.title ?? "";
  nodes.versionDate.value = version?.releaseDate ?? new Date().toISOString().slice(0, 10);
  nodes.versionNotes.value = version?.notes ?? "";
  nodes.versionPublished.checked = version?.published ?? true;
  setMessage(nodes.versionMessage, "");
  nodes.versionDialog.showModal();
}

async function submitAuth() {
  const endpoint = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register";
  try {
    await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        username: nodes.authUsername.value,
        password: nodes.authPassword.value
      })
    });
    if (state.authMode === "register") {
      setMessage(nodes.authMessage, "账号已创建，请登录。", true);
      setAuthMode("login");
      nodes.authPassword.value = "";
      return;
    }
    nodes.authDialog.close();
    nodes.authPassword.value = "";
    await refresh();
  } catch (error) {
    setMessage(nodes.authMessage, error.message);
  }
}

async function submitPassword() {
  try {
    await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: nodes.currentPassword.value,
        newPassword: nodes.newPassword.value
      })
    });
    setMessage(nodes.passwordMessage, "密码已更新。", true);
    nodes.currentPassword.value = "";
    nodes.newPassword.value = "";
  } catch (error) {
    setMessage(nodes.passwordMessage, error.message);
  }
}

async function submitVersion() {
  const id = nodes.versionId.value;
  const payload = {
    version: nodes.versionNumber.value,
    channel: nodes.versionChannel.value,
    title: nodes.versionTitle.value,
    releaseDate: nodes.versionDate.value,
    notes: nodes.versionNotes.value,
    published: nodes.versionPublished.checked
  };

  try {
    await api(id ? `/api/admin/versions/${id}` : "/api/admin/versions", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    nodes.versionDialog.close();
    await refresh();
  } catch (error) {
    setMessage(nodes.versionMessage, error.message);
  }
}

async function submitUpload(form) {
  const fileInput = form.elements.namedItem("installer");
  const platformInput = form.elements.namedItem("platform");
  const archInput = form.elements.namedItem("arch");
  const labelInput = form.elements.namedItem("label");
  const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;
  if (!file) {
    window.alert("请选择安装包文件。");
    return;
  }

  const formData = new FormData();
  const platform = platformInput instanceof HTMLSelectElement ? platformInput.value : "windows";
  const arch = archInput instanceof HTMLSelectElement ? archInput.value : "x64";
  const label = labelInput instanceof HTMLInputElement ? labelInput.value : "";
  formData.append("platform", platform);
  formData.append("arch", arch);
  formData.append("label", label || `${platform} ${arch}`);
  formData.append("installer", file);

  try {
    await api(`/api/admin/versions/${form.dataset.versionId}/packages`, {
      method: "POST",
      body: formData
    });
    form.reset();
    await refresh();
  } catch (error) {
    window.alert(error.message);
  }
}

nodes.loginButton.addEventListener("click", () => {
  setAuthMode("login");
  nodes.authDialog.showModal();
});

nodes.showLogin.addEventListener("click", () => setAuthMode("login"));
nodes.showRegister.addEventListener("click", () => setAuthMode("register"));
nodes.authSubmit.addEventListener("click", submitAuth);

nodes.logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  await refresh();
});

nodes.passwordButton.addEventListener("click", () => {
  setMessage(nodes.passwordMessage, "");
  nodes.passwordDialog.showModal();
});
nodes.passwordSubmit.addEventListener("click", submitPassword);

nodes.newVersionButton.addEventListener("click", () => openVersionDialog());
nodes.versionSubmit.addEventListener("click", submitVersion);

document.querySelectorAll(".close-dialog").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(`#${button.dataset.close}`).close();
  });
});

nodes.adminList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const versionId = target.dataset.id;
  if (target.classList.contains("edit-version") && versionId) {
    const version = state.versions.find((item) => item.id === versionId);
    openVersionDialog(version);
  }

  if (target.classList.contains("delete-version") && versionId) {
    await api(`/api/admin/versions/${versionId}`, { method: "DELETE" });
    await refresh();
  }

  if (target.classList.contains("delete-package")) {
    const packageId = target.dataset.packageId;
    const parentVersionId = target.dataset.versionId;
    if (parentVersionId && packageId) {
      await api(`/api/admin/versions/${parentVersionId}/packages/${packageId}`, { method: "DELETE" });
      await refresh();
    }
  }
});

nodes.adminList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form instanceof HTMLFormElement && form.classList.contains("upload-form")) {
    await submitUpload(form);
  }
});

refresh().catch((error) => {
  nodes.versionsList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
});
