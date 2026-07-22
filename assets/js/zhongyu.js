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
  const sectionLinks = navLinks.filter((link) => link.getAttribute("href")?.startsWith("#"));
  const sections = sectionLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);

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

        sectionLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${visible.target.id}`;
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.2, 0.5] }
    );

    sections.forEach((section) => observer.observe(section));
  }

  const soccerPhotos = [...document.querySelectorAll("[data-soccer-photo]")];
  const soccerLightbox = document.querySelector("[data-soccer-lightbox]");

  if (soccerLightbox && soccerPhotos.length && typeof soccerLightbox.showModal === "function") {
    const lightboxImage = soccerLightbox.querySelector("[data-soccer-lightbox-image]");
    const lightboxTitle = soccerLightbox.querySelector("[data-soccer-lightbox-title]");
    const lightboxMeta = soccerLightbox.querySelector("[data-soccer-lightbox-meta]");
    const lightboxPeople = soccerLightbox.querySelector("[data-soccer-lightbox-people]");
    const closeButton = soccerLightbox.querySelector("[data-soccer-lightbox-close]");
    const previousButton = soccerLightbox.querySelector("[data-soccer-lightbox-prev]");
    const nextButton = soccerLightbox.querySelector("[data-soccer-lightbox-next]");
    let activePhoto = 0;

    const showSoccerPhoto = (index) => {
      activePhoto = (index + soccerPhotos.length) % soccerPhotos.length;
      const photo = soccerPhotos[activePhoto];

      lightboxImage.src = photo.href;
      lightboxImage.alt = photo.dataset.alt;
      lightboxTitle.textContent = photo.dataset.title;
      lightboxMeta.textContent = photo.dataset.meta;
      lightboxPeople.textContent = photo.dataset.people;
    };

    soccerPhotos.forEach((photo, index) => {
      photo.addEventListener("click", (event) => {
        event.preventDefault();
        showSoccerPhoto(index);
        soccerLightbox.showModal();
        root.classList.add("soccer-lightbox-open");
        closeButton?.focus();
      });
    });

    closeButton?.addEventListener("click", () => soccerLightbox.close());
    previousButton?.addEventListener("click", () => showSoccerPhoto(activePhoto - 1));
    nextButton?.addEventListener("click", () => showSoccerPhoto(activePhoto + 1));

    soccerLightbox.addEventListener("click", (event) => {
      const interactiveContent = event.target.closest(".soccer-lightbox-image, .soccer-lightbox-figure figcaption, button");
      if (!interactiveContent) soccerLightbox.close();
    });

    soccerLightbox.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") showSoccerPhoto(activePhoto - 1);
      if (event.key === "ArrowRight") showSoccerPhoto(activePhoto + 1);
    });

    soccerLightbox.addEventListener("close", () => {
      root.classList.remove("soccer-lightbox-open");
    });
  }

  const visitorCount = document.querySelector("[data-visitor-count]");
  const visitorWidget = document.querySelector(".visitor-widget");

  if (visitorWidget) {
    const disableExternalMapLinks = () => {
      visitorWidget.querySelectorAll("a").forEach((link) => {
        link.removeAttribute("href");
        link.removeAttribute("target");
        link.removeAttribute("onclick");
        link.setAttribute("tabindex", "-1");
      });
    };

    const blockMapNavigation = (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    visitorWidget.addEventListener("click", blockMapNavigation, true);
    visitorWidget.addEventListener("auxclick", blockMapNavigation, true);

    disableExternalMapLinks();
    new MutationObserver(disableExternalMapLinks).observe(visitorWidget, {
      childList: true,
      subtree: true,
    });
  }

  if (visitorCount && window.location.hostname === "fan-zhongyu.github.io") {
    const endpoint = "https://page-views-api.ratneshc.com/api/v1";
    const query = new URLSearchParams({ site: "fan-zhongyu.github.io", path: "/" });

    fetch(`${endpoint}/track?${query}`, { keepalive: true }).catch(() => {
      // Counting should remain visible even when this individual tracking request fails.
    });

    fetch(`${endpoint}/views?${query}`)
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
