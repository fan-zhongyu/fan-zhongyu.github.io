(() => {
  const root = document.documentElement;
  const toggle = document.querySelector(".theme-toggle");
  const themeLabel = document.querySelector("[data-theme-label]");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const menu = document.querySelector(".site-menu");

  const applyTheme = (theme) => {
    root.dataset.theme = theme;

    try {
      localStorage.setItem("zf-theme", theme);
    } catch {
      // The selected theme still applies when storage is unavailable.
    }

    const nextTheme = theme === "dark" ? "light" : "dark";
    if (toggle) toggle.setAttribute("aria-label", `Switch to ${nextTheme} mode`);
    if (themeLabel) themeLabel.textContent = nextTheme === "dark" ? "Dark" : "Light";
    if (themeMeta) themeMeta.setAttribute("content", theme === "dark" ? "#0b0b0b" : "#ffffff");
  };

  applyTheme(root.dataset.theme || "light");

  toggle?.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  const navLinks = [...document.querySelectorAll(".menu-nav a")];
  const sections = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);

  navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (menu) menu.open = false;
    });
  });

  document.addEventListener("click", (event) => {
    if (menu?.open && !menu.contains(event.target)) menu.open = false;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu?.open) {
      menu.open = false;
      menu.querySelector("summary")?.focus();
    }
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;

        navLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${visible.target.id}`;
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.2, 0.5] }
    );

    sections.forEach((section) => observer.observe(section));
  }

  const visitorCount = document.querySelector("[data-visitor-count]");

  if (visitorCount && window.location.hostname === "fan-zhongyu.github.io") {
    const endpoint = "https://page-views-api.ratneshc.com/api/v1";
    const query = new URLSearchParams({ site: "fan-zhongyu.github.io", path: "/" });

    fetch(`${endpoint}/track?${query}`, { keepalive: true })
      .then((response) => {
        if (!response.ok) throw new Error(`Tracking failed with status ${response.status}`);
        return fetch(`${endpoint}/views?${query}`);
      })
      .then((response) => {
        if (!response.ok) throw new Error(`Count failed with status ${response.status}`);
        return response.json();
      })
      .then(({ views }) => {
        if (!Number.isFinite(views)) throw new Error("Visitor count was not numeric");
        visitorCount.textContent = new Intl.NumberFormat().format(views);
        visitorCount.setAttribute("aria-label", `${views} counted visits`);
      })
      .catch(() => {
        visitorCount.textContent = "a statistically mysterious number";
        visitorCount.setAttribute("aria-label", "Visitor count temporarily unavailable");
      });
  }
})();
