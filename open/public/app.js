const state = {
  user: null,
  versions: [],
  tools: [],
  comments: [],
  authMode: "login"
};

const nodes = {
  currentUser: document.querySelector("#current-user"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  passwordButton: document.querySelector("#password-button"),
  adminNav: document.querySelector("#admin-nav"),
  adminBand: document.querySelector("#admin"),
  smartDownloadButton: document.querySelector("#smart-download-button"),
  alternateDownloadButton: document.querySelector("#alternate-download-button"),
  platformDownloadLinks: document.querySelectorAll("[data-platform-download]"),
  versionsList: document.querySelector("#versions-list"),
  toolsList: document.querySelector("#tools-list"),
  adminList: document.querySelector("#admin-list"),
  adminToolsList: document.querySelector("#admin-tools-list"),
  commentsList: document.querySelector("#comments-list"),
  commentForm: document.querySelector("#comment-form"),
  commentBody: document.querySelector("#comment-body"),
  commentMessage: document.querySelector("#comment-message"),
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
  versionSubmit: document.querySelector("#version-submit"),
  newToolButton: document.querySelector("#new-tool-button"),
  toolDialog: document.querySelector("#tool-dialog"),
  toolDialogTitle: document.querySelector("#tool-dialog-title"),
  toolId: document.querySelector("#tool-id"),
  toolName: document.querySelector("#tool-name"),
  toolSlug: document.querySelector("#tool-slug"),
  toolCategory: document.querySelector("#tool-category"),
  toolSortOrder: document.querySelector("#tool-sort-order"),
  toolSummary: document.querySelector("#tool-summary"),
  toolDescription: document.querySelector("#tool-description"),
  toolHomepage: document.querySelector("#tool-homepage"),
  toolFeatured: document.querySelector("#tool-featured"),
  toolPublished: document.querySelector("#tool-published"),
  toolMessage: document.querySelector("#tool-message"),
  toolSubmit: document.querySelector("#tool-submit")
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

function normalizeToken(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function getClientPlatform() {
  const platform = normalizeToken(navigator.userAgentData?.platform || navigator.platform || "");
  const ua = normalizeToken(navigator.userAgent);

  if (platform.includes("mac") || ua.includes("macos") || ua.includes("macintosh")) {
    return "macos";
  }
  if (platform.includes("win") || ua.includes("windows")) {
    return "windows";
  }
  if (platform.includes("linux") || ua.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

function getArchitectureHints() {
  const ua = normalizeToken(navigator.userAgent);
  const hints = [];

  if (ua.includes("arm64") || ua.includes("aarch64")) {
    hints.push("arm64", "aarch64", "apple", "silicon");
  }
  if (ua.includes("x8664") || ua.includes("x64") || ua.includes("amd64") || ua.includes("win64")) {
    hints.push("x64", "amd64", "x8664", "intel");
  }
  return hints;
}

function packageMatchesPlatform(pkg, platform) {
  const value = normalizeToken(`${pkg.platform} ${pkg.label} ${pkg.originalName}`);

  if (platform === "macos") {
    return value.includes("mac") || value.includes("darwin") || value.includes("dmg");
  }
  if (platform === "windows") {
    return value.includes("windows") || value.includes("win") || value.includes("exe") || value.includes("msi");
  }
  if (platform === "linux") {
    return value.includes("linux") || value.includes("deb") || value.includes("rpm") || value.includes("appimage");
  }
  return false;
}

function scorePackage(pkg, platform, architectureHints = []) {
  if (!packageMatchesPlatform(pkg, platform)) {
    return -1;
  }

  const value = normalizeToken(`${pkg.arch} ${pkg.label} ${pkg.originalName}`);
  let score = 10;
  architectureHints.forEach((hint, index) => {
    if (value.includes(hint)) {
      score += 20 - index;
    }
  });
  if (platform === "macos" && architectureHints.length === 0 && (value.includes("arm64") || value.includes("aarch64") || value.includes("apple"))) {
    score += 3;
  }
  if (value.includes("universal")) {
    score += 5;
  }
  return score;
}

function findDownloadForPlatform(platform) {
  const architectureHints = getArchitectureHints();

  for (const version of state.versions) {
    const candidates = version.packages
      .map((pkg) => ({ pkg, score: scorePackage(pkg, platform, architectureHints) }))
      .filter((candidate) => candidate.score >= 0)
      .sort((left, right) => right.score - left.score);

    if (candidates.length > 0) {
      return { version, pkg: candidates[0].pkg };
    }
  }

  return null;
}

function getPlatformLabel(platform) {
  return {
    macos: "macOS",
    windows: "Windows",
    linux: "Linux"
  }[platform] ?? "当前设备";
}

function getDownloadEndpoint(platform) {
  return platform && platform !== "auto" ? `/api/download/latest?platform=${platform}` : "/api/download/latest";
}

function applyDownloadTarget(link, match, fallbackText, platform = "auto") {
  if (!link) {
    return;
  }

  if (!match) {
    link.href = "/#versions";
    link.removeAttribute("download");
    link.classList.add("is-unavailable");
    link.textContent = fallbackText;
    return;
  }

  link.href = getDownloadEndpoint(platform);
  link.removeAttribute("download");
  link.classList.remove("is-unavailable");
}

function renderSmartDownload() {
  const platform = getClientPlatform();
  const platformLabel = getPlatformLabel(platform);
  const alternatePlatform = platform === "windows" ? "macos" : "windows";
  const alternateLabel = getPlatformLabel(alternatePlatform);
  const match = platform === "unknown" ? null : findDownloadForPlatform(platform);
  const alternateMatch = findDownloadForPlatform(alternatePlatform);

  applyDownloadTarget(nodes.smartDownloadButton, match, `下载 ${platformLabel} 版`, platform);
  if (match) {
    nodes.smartDownloadButton.textContent = `下载 ${platformLabel} 版`;
    nodes.smartDownloadButton.setAttribute("title", `${match.version.version} · ${match.pkg.originalName}`);
  } else {
    nodes.smartDownloadButton.textContent = `下载 ${platformLabel} 版`;
    nodes.smartDownloadButton.setAttribute("title", "当前设备暂未匹配到直链安装包，可在下载中心查看全部版本。");
  }

  applyDownloadTarget(nodes.alternateDownloadButton, alternateMatch, `下载 ${alternateLabel} 版`, alternatePlatform);
  nodes.alternateDownloadButton.textContent = `下载 ${alternateLabel} 版`;
  nodes.alternateDownloadButton.setAttribute(
    "title",
    alternateMatch ? `${alternateMatch.version.version} · ${alternateMatch.pkg.label}` : `查看 ${alternateLabel} 下载列表`
  );

  nodes.platformDownloadLinks.forEach((link) => {
    const targetPlatform = link.dataset.platformDownload;
    const platformMatch = findDownloadForPlatform(targetPlatform);
    applyDownloadTarget(link, platformMatch, link.textContent, targetPlatform);
    if (platformMatch) {
      link.setAttribute("title", `${platformMatch.version.version} · ${platformMatch.pkg.label}`);
    } else {
      link.setAttribute("title", `查看 ${getPlatformLabel(targetPlatform)} 下载列表`);
    }
  });
}

function toDate(value) {
  if (!value) {
    return new Date();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00`);
  }
  return new Date(value);
}

function toDateTimeInputValue(value) {
  const date = toDate(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 19);
}

function formatDateTime(value) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function renderVersionNotes(notes) {
  const lines = String(notes ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return `<p class="empty-state">暂无版本说明。</p>`;
  }

  return `
    <div class="version-notes-panel">
      <div class="release-section-title">版本说明</div>
      <ul class="version-notes-list">
        ${lines.map((line) => `<li>${escapeHtml(line.replace(/^[-*•]\s*/, ""))}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderVersionDetails(version, options = {}) {
  const isOpen = Boolean(options.open);
  const summaryText = options.latest ? "最新版本更新内容" : isOpen ? "版本说明" : "查看本版本更新内容";
  return `
    <details class="version-details ${options.latest ? "latest-notes" : ""}" ${isOpen ? "open" : ""}>
      <summary>${summaryText}</summary>
      ${renderVersionNotes(version.notes)}
    </details>
  `;
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

function renderVersionCard(version, index = 0) {
  const packages = version.packages.length
    ? `
      <div class="release-section-title">安装包下载</div>
      <div class="package-list">
        ${version.packages
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
        .join("")}
      </div>
    `
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
          <p class="package-meta">
            ${escapeHtml(version.version)} · 发布时间 ${formatDateTime(version.releaseDate)}
            ${version.updatedAt ? ` · 更新于 ${formatDateTime(version.updatedAt)}` : ""}
          </p>
        </div>
      </div>
      ${renderVersionDetails(version, { open: index === 0, latest: index === 0 })}
      ${packages}
    </article>
  `;
}

function renderHistorySection(items, renderer, label) {
  if (items.length === 0) {
    return "";
  }

  return `
    <details class="history-section">
      <summary>
        <span>${escapeHtml(label)}</span>
        <small>${items.length} 个历史版本</small>
      </summary>
      <div class="history-list">
        ${items.map((item, index) => renderer(item, index + 1)).join("")}
      </div>
    </details>
  `;
}

function renderVersions() {
  if (state.versions.length === 0) {
    nodes.versionsList.innerHTML = `<p class="empty-state">暂无可下载版本。</p>`;
    return;
  }

  const [latest, ...history] = state.versions;
  nodes.versionsList.innerHTML = `
    ${renderVersionCard(latest, 0)}
    ${renderHistorySection(history, renderVersionCard, "历史版本")}
  `;
}

function renderToolPackages(tool) {
  if (!tool.packages?.length) {
    return `<p class="empty-state">暂未上传安装包。</p>`;
  }

  const grouped = tool.packages.reduce((groups, pkg) => {
    const key = packageMatchesPlatform(pkg, "macos")
      ? "macOS"
      : packageMatchesPlatform(pkg, "windows")
        ? "Windows"
        : getPlatformLabel(pkg.platform);
    groups[key] = groups[key] ?? [];
    groups[key].push(pkg);
    return groups;
  }, {});

  return Object.entries(grouped)
    .map(
      ([platform, packages]) => `
        <div class="tool-package-group">
          <div class="tool-package-platform">${escapeHtml(platform)}</div>
          <div class="tool-package-links">
            ${packages
              .map(
                (pkg) => `
                  <a class="secondary tool-download" href="${escapeHtml(pkg.url)}" download>
                    ${escapeHtml(pkg.label || `${pkg.platform} ${pkg.arch}`)}
                    <span>${escapeHtml(pkg.arch)} · ${formatBytes(pkg.size)}</span>
                  </a>
                `
              )
              .join("")}
          </div>
        </div>
      `
    )
    .join("");
}

function renderTools() {
  if (state.tools.length === 0) {
    nodes.toolsList.innerHTML = `<p class="empty-state">工具包正在整理中，稍后会开放下载。</p>`;
    return;
  }

  nodes.toolsList.innerHTML = state.tools
    .map(
      (tool, index) => `
        <article class="tool-card ${tool.featured || index === 0 ? "featured" : ""}">
          <div class="tool-card-top">
            <div>
              <span class="tool-category">${escapeHtml(tool.category || "工具包")}</span>
              <h3>${escapeHtml(tool.name)}</h3>
              <p>${escapeHtml(tool.summary)}</p>
            </div>
            ${tool.featured ? '<span class="badge stable">推荐</span>' : ""}
          </div>
          ${tool.description ? `<p class="tool-description">${escapeHtml(tool.description)}</p>` : ""}
          <div class="tool-package-list">${renderToolPackages(tool)}</div>
          ${tool.homepage ? `<a class="tool-homepage" href="${escapeHtml(tool.homepage)}" target="_blank" rel="noreferrer">查看说明</a>` : ""}
        </article>
      `
    )
    .join("");
}

function renderAdmin() {
  if (state.user?.role !== "admin") {
    return;
  }

  const renderAdminVersionCard = (version) => {
    const packages = version.packages
      .map(
        (pkg) => `
          <div class="package-row">
            <div>
              <div class="package-name">${escapeHtml(pkg.label)}</div>
              <p class="package-meta">
                ${escapeHtml(pkg.originalName)} · ${formatBytes(pkg.size)}
                · 自动更新 ${pkg.updaterSignature ? "已配置签名" : "未配置签名"}
              </p>
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
            <p class="package-meta">
              ${escapeHtml(version.version)} · ${escapeHtml(version.channel)} · ${version.published ? "Published" : "Draft"}
              · 更新于 ${formatDateTime(version.updatedAt ?? version.releaseDate)}
            </p>
          </div>
          <div class="admin-actions">
            <button class="ghost edit-version" data-id="${escapeHtml(version.id)}" type="button">编辑版本/说明</button>
            <button class="danger delete-version" data-id="${escapeHtml(version.id)}" type="button">删除</button>
          </div>
        </div>
        ${renderVersionDetails(version, { open: true })}
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
            <label>
              自动更新签名
              <input name="signatureFile" type="file" accept=".sig,.txt" />
            </label>
            <label class="wide-field">
              或粘贴签名内容
              <textarea name="signature" rows="3" placeholder="从 .sig 文件复制完整内容；仅用于自动更新校验，普通下载可留空。"></textarea>
            </label>
            <button class="primary upload-inline" type="submit">上传</button>
          </form>
        </div>
      </article>
    `;
  };

  const [latest, ...history] = state.versions;
  nodes.adminList.innerHTML = `
    ${latest ? renderAdminVersionCard(latest) : '<p class="empty-state">暂无版本。</p>'}
    ${renderHistorySection(history, renderAdminVersionCard, "历史版本管理")}
  `;
}

function renderAdminTools() {
  if (state.user?.role !== "admin") {
    return;
  }

  if (state.tools.length === 0) {
    nodes.adminToolsList.innerHTML = `
      <article class="admin-card admin-empty-card">
        <div>
          <h3>还没有工具包</h3>
          <p class="package-meta">
            先新增一个工具，保存后这里会出现该工具的 Windows / macOS 安装包上传入口。
          </p>
        </div>
        <button class="primary new-tool-shortcut" type="button">新增工具并上传</button>
      </article>
    `;
    return;
  }

  nodes.adminToolsList.innerHTML = state.tools
    .map((tool) => {
      const packages = tool.packages
        .map(
          (pkg) => `
            <div class="package-row">
              <div>
                <div class="package-name">${escapeHtml(pkg.label)}</div>
                <p class="package-meta">
                  ${escapeHtml(pkg.platform)} · ${escapeHtml(pkg.arch)} · ${escapeHtml(pkg.originalName)} · ${formatBytes(pkg.size)}
                </p>
              </div>
              <button class="danger delete-tool-package" data-tool-id="${escapeHtml(tool.id)}" data-package-id="${escapeHtml(pkg.id)}" type="button">删除</button>
            </div>
          `
        )
        .join("");

      return `
        <article class="admin-card tool-admin-card">
          <div class="admin-header">
            <div>
              <h3>${escapeHtml(tool.name)}</h3>
              <p class="package-meta">
                ${escapeHtml(tool.category || "工具包")} · ${tool.featured ? "Featured" : "Normal"} · ${tool.published ? "Published" : "Draft"}
                · 更新于 ${formatDateTime(tool.updatedAt ?? tool.createdAt)}
              </p>
            </div>
            <div class="admin-actions">
              <button class="ghost edit-tool" data-id="${escapeHtml(tool.id)}" type="button">编辑工具</button>
              <button class="danger delete-tool" data-id="${escapeHtml(tool.id)}" type="button">删除</button>
            </div>
          </div>
          <p class="tool-admin-summary">${escapeHtml(tool.summary)}</p>
          <div class="package-list">${packages || '<p class="empty-state">尚未上传工具包。</p>'}</div>
          <div class="upload-panel">
            <h4>上传此工具安装包</h4>
            <form class="tool-upload-form" data-tool-id="${escapeHtml(tool.id)}">
              <label>
                平台
                <select name="platform">
                  <option value="windows">Windows</option>
                  <option value="macos">macOS</option>
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
                <input name="label" placeholder="Windows x64" />
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

function renderComments() {
  if (state.comments.length === 0) {
    nodes.commentsList.innerHTML = `<p class="empty-state">还没有评论，欢迎留下第一个建议。</p>`;
    return;
  }

  const canManageComments = state.user?.role === "admin";
  nodes.commentsList.innerHTML = state.comments
    .map(
      (comment) => `
        <article class="comment-card">
          <div class="comment-header">
            <div>
              <div class="comment-author">
                <span>${escapeHtml(comment.authorName)}</span>
                <span class="badge ${comment.authorType === "user" ? "stable" : ""}">${comment.authorType === "user" ? "已登录" : "游客"}</span>
              </div>
              <p class="package-meta">${escapeHtml(comment.location)} · ${escapeHtml(comment.device)} · ${formatDateTime(comment.createdAt)}</p>
            </div>
            ${canManageComments ? `<button class="danger delete-comment" data-comment-id="${escapeHtml(comment.id)}" type="button">删除</button>` : ""}
          </div>
          <p class="comment-body">${escapeHtml(comment.body)}</p>
        </article>
      `
    )
    .join("");
}

function render() {
  renderShell();
  renderSmartDownload();
  renderVersions();
  renderTools();
  renderAdmin();
  renderAdminTools();
  renderComments();
}

async function refresh() {
  const [me, versions, tools, comments] = await Promise.all([api("/api/me"), api("/api/versions"), api("/api/tools"), api("/api/comments")]);
  state.user = me.user;
  state.versions = versions.versions;
  state.tools = tools.tools;
  state.comments = comments.comments;
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
  nodes.versionDate.value = toDateTimeInputValue(version?.releaseDate ?? new Date().toISOString());
  nodes.versionNotes.value = version?.notes ?? "";
  nodes.versionPublished.checked = version?.published ?? true;
  setMessage(nodes.versionMessage, "");
  nodes.versionDialog.showModal();
}

function openToolDialog(tool = null) {
  nodes.toolDialogTitle.textContent = tool ? "编辑工具" : "新增工具";
  nodes.toolId.value = tool?.id ?? "";
  nodes.toolName.value = tool?.name ?? "";
  nodes.toolSlug.value = tool?.slug ?? "";
  nodes.toolCategory.value = tool?.category ?? "效率工具";
  nodes.toolSortOrder.value = String(tool?.sortOrder ?? 0);
  nodes.toolSummary.value = tool?.summary ?? "";
  nodes.toolDescription.value = tool?.description ?? "";
  nodes.toolHomepage.value = tool?.homepage ?? "";
  nodes.toolFeatured.checked = Boolean(tool?.featured);
  nodes.toolPublished.checked = tool?.published ?? true;
  setMessage(nodes.toolMessage, "");
  nodes.toolDialog.showModal();
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

async function submitTool() {
  const id = nodes.toolId.value;
  const payload = {
    name: nodes.toolName.value,
    slug: nodes.toolSlug.value,
    category: nodes.toolCategory.value,
    summary: nodes.toolSummary.value,
    description: nodes.toolDescription.value,
    homepage: nodes.toolHomepage.value,
    featured: nodes.toolFeatured.checked,
    published: nodes.toolPublished.checked,
    sortOrder: Number(nodes.toolSortOrder.value || 0)
  };

  try {
    await api(id ? `/api/admin/tools/${id}` : "/api/admin/tools", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    nodes.toolDialog.close();
    await refresh();
  } catch (error) {
    setMessage(nodes.toolMessage, error.message);
  }
}

async function submitUpload(form) {
  const fileInput = form.elements.namedItem("installer");
  const platformInput = form.elements.namedItem("platform");
  const archInput = form.elements.namedItem("arch");
  const labelInput = form.elements.namedItem("label");
  const signatureInput = form.elements.namedItem("signature");
  const signatureFileInput = form.elements.namedItem("signatureFile");
  const file = fileInput instanceof HTMLInputElement ? fileInput.files?.[0] : null;
  const signatureFile = signatureFileInput instanceof HTMLInputElement ? signatureFileInput.files?.[0] : null;
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
  if (signatureInput instanceof HTMLTextAreaElement && signatureInput.value.trim()) {
    formData.append("signature", signatureInput.value.trim());
  }
  if (signatureFile) {
    formData.append("signatureFile", signatureFile);
  }

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

async function submitToolUpload(form) {
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
    await api(`/api/admin/tools/${form.dataset.toolId}/packages`, {
      method: "POST",
      body: formData
    });
    form.reset();
    await refresh();
  } catch (error) {
    window.alert(error.message);
  }
}

async function submitComment(event) {
  event.preventDefault();
  const body = nodes.commentBody.value.trim();
  if (body.length < 2) {
    setMessage(nodes.commentMessage, "请至少输入 2 个字符。");
    return;
  }

  try {
    const payload = await api("/api/comments", {
      method: "POST",
      body: JSON.stringify({ body })
    });
    state.comments = [payload.comment, ...state.comments];
    nodes.commentBody.value = "";
    setMessage(nodes.commentMessage, "评论已发布。", true);
    renderComments();
  } catch (error) {
    setMessage(nodes.commentMessage, error.message);
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
nodes.newToolButton.addEventListener("click", () => openToolDialog());
nodes.toolSubmit.addEventListener("click", submitTool);
nodes.commentForm.addEventListener("submit", submitComment);

nodes.commentsList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.classList.contains("delete-comment")) {
    return;
  }

  const commentId = target.dataset.commentId;
  if (!commentId || !window.confirm("确定删除这条评论吗？")) {
    return;
  }

  try {
    await api(`/api/admin/comments/${commentId}`, { method: "DELETE" });
    state.comments = state.comments.filter((comment) => comment.id !== commentId);
    renderComments();
  } catch (error) {
    window.alert(error.message);
  }
});

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

nodes.adminToolsList.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const toolId = target.dataset.id;
  if (target.classList.contains("new-tool-shortcut")) {
    openToolDialog();
    return;
  }

  if (target.classList.contains("edit-tool") && toolId) {
    const tool = state.tools.find((item) => item.id === toolId);
    openToolDialog(tool);
  }

  if (target.classList.contains("delete-tool") && toolId) {
    if (!window.confirm("确定删除这个工具及其安装包记录吗？")) {
      return;
    }
    await api(`/api/admin/tools/${toolId}`, { method: "DELETE" });
    await refresh();
  }

  if (target.classList.contains("delete-tool-package")) {
    const packageId = target.dataset.packageId;
    const parentToolId = target.dataset.toolId;
    if (parentToolId && packageId) {
      await api(`/api/admin/tools/${parentToolId}/packages/${packageId}`, { method: "DELETE" });
      await refresh();
    }
  }
});

nodes.adminToolsList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form instanceof HTMLFormElement && form.classList.contains("tool-upload-form")) {
    await submitToolUpload(form);
  }
});

function initHeroMotion() {
  const hero = document.querySelector(".hero");
  if (!hero) {
    return;
  }

  let frame = 0;
  let dragging = false;

  function setPosition(clientX, clientY) {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
    frame = window.requestAnimationFrame(() => {
      const rect = hero.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      hero.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
      hero.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
      hero.style.setProperty("--tilt-x", `${((0.5 - y) * 8).toFixed(2)}deg`);
      hero.style.setProperty("--tilt-y", `${((x - 0.5) * 10).toFixed(2)}deg`);
    });
  }

  hero.addEventListener("pointermove", (event) => {
    setPosition(event.clientX, event.clientY);
  });
  hero.addEventListener("pointerdown", (event) => {
    dragging = true;
    hero.classList.add("is-dragging");
    hero.setPointerCapture(event.pointerId);
    setPosition(event.clientX, event.clientY);
  });
  hero.addEventListener("pointerup", (event) => {
    dragging = false;
    hero.classList.remove("is-dragging");
    hero.releasePointerCapture(event.pointerId);
  });
  hero.addEventListener("pointerleave", () => {
    if (!dragging) {
      hero.style.setProperty("--tilt-x", "0deg");
      hero.style.setProperty("--tilt-y", "0deg");
    }
  });
}

function initGlyphTrail() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const glyphs = [
    "SELECT", "WHERE", "JOIN", "INDEX", "INSERT", "UPDATE", "DELETE", "LIMIT", "ORDER", "GROUP",
    "SQL", "DDL", "DML", "JSON", "BLOB", "UUID", "VIEW", "TRX", "LOCK", "CACHE",
    "MySQL", "Redis", "PG", "DB", "AI", "PK", "FK", "ER", "EXPLAIN", "SYNC",
    ">>", "--", "/*", "*/", "::", "()", "{}", "[]", "<>", "↗", "⟶", "⟲", "⧉"
  ];
  const layer = document.createElement("div");
  let lastSpawn = 0;
  let ambientTimer = 0;
  let lastPointer = null;

  layer.className = "glyph-trail";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  document.body.classList.add("glyph-trail-ready");

  function spawnGlyph(x, y, ambient = false, burstIndex = 0, vector = null) {
    const glyph = document.createElement("span");
    const angle = Math.random() * Math.PI * 2;
    const distance = ambient ? 56 + Math.random() * 140 : 22 + Math.random() * 56;
    const driftX = vector ? vector.x * distance + vector.normalX * ((Math.random() - 0.5) * 32) : Math.cos(angle) * distance;
    const driftY = vector ? vector.y * distance + vector.normalY * ((Math.random() - 0.5) * 32) : Math.sin(angle) * distance - 12;
    const duration = ambient ? 5.6 + Math.random() * 2.2 : 3.6 + Math.random() * 1.8;

    glyph.className = "trail-glyph";
    glyph.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    glyph.style.setProperty("--glyph-x", `${x + (Math.random() - 0.5) * (ambient ? 60 : 18)}px`);
    glyph.style.setProperty("--glyph-y", `${y + (Math.random() - 0.5) * (ambient ? 48 : 18)}px`);
    glyph.style.setProperty("--glyph-dx", `${driftX.toFixed(1)}px`);
    glyph.style.setProperty("--glyph-dy", `${driftY.toFixed(1)}px`);
    glyph.style.setProperty("--glyph-size", `${ambient ? 8 + Math.random() * 5 : 9 + Math.random() * 7}px`);
    glyph.style.setProperty("--glyph-duration", `${duration.toFixed(2)}s`);
    glyph.style.setProperty("--glyph-opacity", `${ambient ? 0.14 + Math.random() * 0.18 : Math.max(0.26, 0.54 - burstIndex * 0.04 + Math.random() * 0.12)}`);
    layer.append(glyph);
    window.setTimeout(() => glyph.remove(), duration * 1000 + 120);
  }

  function spawnCluster(x, y, count, ambient = false, previous = null) {
    const deltaX = previous ? x - previous.x : 0;
    const deltaY = previous ? y - previous.y : 0;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const tangent = previous
      ? { x: deltaX / length, y: deltaY / length, normalX: -deltaY / length, normalY: deltaX / length }
      : null;

    for (let index = 0; index < count; index += 1) {
      const progress = previous ? index / Math.max(1, count - 1) : 1;
      const baseX = previous ? previous.x + deltaX * progress : x;
      const baseY = previous ? previous.y + deltaY * progress : y;
      const side = index % 2 === 0 ? -1 : 1;
      const offset = tangent && !ambient ? 8 + Math.random() * 18 : 0;
      const vector = tangent
        ? {
          x: tangent.x * (side === -1 ? -0.72 : 0.72),
          y: tangent.y * (side === -1 ? -0.72 : 0.72),
          normalX: tangent.normalX,
          normalY: tangent.normalY
        }
        : null;
      spawnGlyph(
        baseX + (tangent ? tangent.normalX * offset * side : 0),
        baseY + (tangent ? tangent.normalY * offset * side : 0),
        ambient,
        index,
        vector
      );
    }
  }

  window.addEventListener("pointermove", (event) => {
    const now = performance.now();
    if (now - lastSpawn < 76) {
      lastPointer = { x: event.clientX, y: event.clientY };
      return;
    }
    const previous = lastPointer;
    lastSpawn = now;
    lastPointer = { x: event.clientX, y: event.clientY };
    spawnCluster(event.clientX, event.clientY, 3 + Math.floor(Math.random() * 2), false, previous);
  }, { passive: true });

  ambientTimer = window.setInterval(() => {
    spawnCluster(Math.random() * window.innerWidth, window.innerHeight * (0.18 + Math.random() * 0.66), 1 + Math.floor(Math.random() * 2), true);
  }, 980);

  window.addEventListener("beforeunload", () => window.clearInterval(ambientTimer));
}

initHeroMotion();
initGlyphTrail();

refresh().catch((error) => {
  nodes.versionsList.innerHTML = `<p class="empty-state">${escapeHtml(error.message)}</p>`;
});
