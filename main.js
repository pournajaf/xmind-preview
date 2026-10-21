const {
  Plugin,
  Modal,
  Notice,
  requestUrl
} = require("obsidian");

const CATEGORIES = {
  speech: { id: "speech", title: "خطبه‌ها", singular: "خطبه", count: 241, icon: "📜", urlSegment: "speech" },
  letter: { id: "letter", title: "نامه‌ها", singular: "نامه", count: 79, icon: "✉️", urlSegment: "letter" },
  wisdom: { id: "wisdom", title: "حکمت‌ها", singular: "حکمت", count: 480, icon: "💎", urlSegment: "wisdom" }
};

const nahjCache = new Map();

// تابع هوشمند حذف کامل فوتر، بسم‌الله پایانی و متون کپی‌رایت
function cleanNahjGarbage(text) {
  if (!text) return "";
  let cleaned = text;

  // ۱. برش قطعی از عبارت «بسم‌الله... بنام خداوند بخشنده مهربان» تا انتهای متن
  cleaned = cleaned.replace(/(?:بِسْمِ\s*اللَّهِ\s*الرَّحْمٰنِ\s*الرَّحِيمِ|بسم\s*الله\s*الرحمن\s*الرحیم)\s*(?:بنام|به\s*نام)\s*خداوند[\s\S]*$/gi, "");

  // ۲. حذف جملات کپی‌رایت و امضای طراح سایت تا انتهای متن
  cleaned = cleaned.replace(/استفاده\s+از\s+مطالب\s+با\s+ذکر\s+منبع[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/طراحی\s*[،,]\s*برنامه\s*نویسی[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/\bMITC\b[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/دفتر\s+مرجع\s+عالیقدر[\s\S]*$/gi, "");
  cleaned = cleaned.replace(/پایگاه\s+اطلاع\s*رسانی\s+دفتر[\s\S]*$/gi, "");

  return cleaned.trim();
}

async function fetchNahjItem(categoryKey, number) {
  const cacheKey = `${categoryKey}:${number}`;
  if (nahjCache.has(cacheKey)) {
    return nahjCache.get(cacheKey);
  }

  const cat = CATEGORIES[categoryKey];
  const targetUrl = `https://nahj.makarem.ir/${cat.urlSegment}/${number}`;

  try {
    const response = await requestUrl({
      url: targetUrl,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ObsidianKalamAmir/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      }
    });

    if (response.status !== 200 || !response.text) {
      throw new Error("پاسخ نامعتبر از سرور");
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(response.text, "text/html");

    // حذف کامل المان‌های فوتر و حق نشر از سند DOM قبل از شروع استخراج
    const unwantedElements = doc.querySelectorAll("footer, .footer, #footer, .site-footer, .footer-bottom, .copyright, .designer, .developer, script, style");
    unwantedElements.forEach((el) => el.remove());

    // استخراج عنوان
    let title = "";
    const titleEl = doc.querySelector(".speech-title, .title, h1, h2");
    if (titleEl) {
      title = cleanNahjGarbage(titleEl.textContent);
    } else {
      title = `${cat.singular} شماره ${number}`;
    }

    // استخراج متن عربی
    let arabic = "";
    const arabicNodes = doc.querySelectorAll(".arabic, .arabic-text, blockquote, .matn-arabic");
    if (arabicNodes.length > 0) {
      arabic = Array.from(arabicNodes)
        .map((n) => cleanNahjGarbage(n.textContent))
        .filter((t) => t && !t.includes("بنام خداوند بخشنده مهربان") && !t.includes("استفاده از مطالب"))
        .join("\n\n");
    }

    // استخراج ترجمه فارسی
    let translation = "";
    const transNodes = doc.querySelectorAll(".translation, .farsi, .tarjome, .farsi-text");
    if (transNodes.length > 0) {
      translation = Array.from(transNodes)
        .map((n) => cleanNahjGarbage(n.textContent))
        .filter((t) => t && !t.includes("بنام خداوند بخشنده مهربان") && !t.includes("استفاده از مطالب"))
        .join("\n\n");
    }

    // ساختار جایگزین در صورت تفاوت نام کلاس‌ها
    if (!arabic || !translation) {
      const paragraphs = Array.from(doc.querySelectorAll("p, article p, .content p"))
        .map((p) => cleanNahjGarbage(p.textContent))
        .filter((t) =>
          t.length > 15 &&
          !t.includes("خطبه چیست") &&
          !t.includes("نامه چیست") &&
          !t.includes("بنام خداوند بخشنده مهربان") &&
          !t.includes("استفاده از مطالب") &&
          !t.includes("MITC")
        );

      if (paragraphs.length >= 2) {
        if (!arabic) arabic = paragraphs[0];
        if (!translation) translation = paragraphs.slice(1).join("\n\n");
      } else if (paragraphs.length === 1) {
        translation = paragraphs[0];
      }
    }

    arabic = cleanNahjGarbage(arabic);
    translation = cleanNahjGarbage(translation);

    const result = {
      categoryKey,
      categoryTitle: cat.singular,
      number: Number(number),
      total: cat.count,
      title: title || `${cat.singular} ${number}`,
      arabic: arabic || `متن عربی ${cat.singular} ${number} نهج‌البلاغه`,
      translation: translation || `جهت مطالعه ترجمه کامل به پایگاه مکارم متصل شوید.`,
      url: targetUrl
    };

    nahjCache.set(cacheKey, result);

    if (Number(number) < cat.count) {
      setTimeout(() => {
        fetchNahjItem(categoryKey, Number(number) + 1).catch(() => {});
      }, 500);
    }

    return result;
  } catch (err) {
    return {
      categoryKey,
      categoryTitle: cat.singular,
      number: Number(number),
      total: cat.count,
      title: `${cat.singular} شماره ${number}`,
      arabic: `متن عربی ${cat.singular} ${number} از نهج‌البلاغه شریف`,
      translation: `جهت مطالعه متن و ترجمه به پایگاه رسمی متصل شوید.`,
      url: targetUrl
    };
  }
}

class KalamAmirGlassModal extends Modal {
  constructor(app, plugin, initialCategory = "wisdom", initialNumber = 1) {
    super(app);
    this.plugin = plugin;
    this.categoryKey = initialCategory;
    this.number = initialNumber;
    this.currentData = null;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("nahj-modal-overlay");
    modalEl.addClass("nahj-modal-box");

    // ۱. هدر شیشه‌ای
    const header = contentEl.createDiv({ cls: "nahj-header" });
    const title = header.createDiv({ cls: "nahj-header-title" });
    title.innerHTML = `<span>✨</span> کلام امیر (ع)`;

    const siteLinkBtn = header.createEl("button", {
      cls: "nahj-btn nahj-btn-glass",
      text: "🌐 پایگاه نهج البلاغه آیت الله مکارم (مدظله العالی)"
    });
    siteLinkBtn.onclick = () => {
      const cat = CATEGORIES[this.categoryKey];
      window.open(`https://nahj.makarem.ir/${cat.urlSegment}/${this.number}`, "_blank");
    };

    // ۲. تب‌های سه‌گانه
    const tabsRow = contentEl.createDiv({ cls: "nahj-category-tabs" });
    Object.values(CATEGORIES).forEach((cat) => {
      const pill = tabsRow.createEl("button", {
        cls: `nahj-tab-pill ${this.categoryKey === cat.id ? "is-active" : ""}`,
        text: `${cat.icon} ${cat.title} (${cat.count})`
      });
      pill.onclick = () => {
        if (this.categoryKey !== cat.id) {
          this.categoryKey = cat.id;
          this.number = 1;
          tabsRow.querySelectorAll(".nahj-tab-pill").forEach((p) => p.classList.remove("is-active"));
          pill.classList.add("is-active");
          this.rebuildSelector();
          this.loadData();
        }
      };
    });

    // ۳. ردیف جستجو و انتخاب شماره
    const selectorRow = contentEl.createDiv({ cls: "nahj-selector-row" });

    this.searchInput = selectorRow.createEl("input", {
      cls: "nahj-input-field nahj-search-input",
      type: "text",
      attr: { placeholder: "🔍 جستجوی شماره یا کلمه (مثلاً: ۳ یا شقشقیه)..." }
    });

    this.numberSelect = selectorRow.createEl("select", {
      cls: "nahj-input-field nahj-number-select"
    });

    this.rebuildSelector();

    this.numberSelect.onchange = () => {
      this.number = parseInt(this.numberSelect.value, 10) || 1;
      this.loadData();
    };

    this.searchInput.oninput = () => {
      const q = this.searchInput.value.trim().toLowerCase();
      const num = parseInt(q, 10);
      const cat = CATEGORIES[this.categoryKey];

      if (!isNaN(num) && num >= 1 && num <= cat.count) {
        this.number = num;
        this.numberSelect.value = String(num);
        this.loadData();
      }
    };

    // ۴. کارت شیشه‌ای پیش‌نمایش
    this.previewCard = contentEl.createDiv({ cls: "nahj-preview-card" });

    // ۵. نوار ناوبری و دکمه‌های پایینی
    const bottomBar = contentEl.createDiv({ cls: "nahj-bottom-bar" });

    const navRow = bottomBar.createDiv({ cls: "nahj-nav-row" });
    const prevBtn = navRow.createEl("button", { cls: "nahj-btn nahj-btn-nav", text: "مورد قبل ►" });
    this.navInfoEl = navRow.createDiv({ cls: "nahj-nav-info", text: "" });
    const nextBtn = navRow.createEl("button", { cls: "nahj-btn nahj-btn-nav", text: "◄ مورد بعد" });

    prevBtn.onclick = () => this.navigateItem(-1);
    nextBtn.onclick = () => this.navigateItem(1);

    const actionsRow = bottomBar.createDiv({ cls: "nahj-actions-row" });

    const insertBtn = actionsRow.createEl("button", {
      cls: "nahj-btn nahj-btn-primary",
      text: "📥 درج در نوت"
    });
    insertBtn.onclick = () => this.insertToActiveNote();

    const copyGroup = actionsRow.createDiv({ cls: "nahj-btn-group" });

    const copyAllBtn = copyGroup.createEl("button", {
      cls: "nahj-btn nahj-btn-glass",
      text: "💎 کپی کامل"
    });
    copyAllBtn.title = "کپی عربی + ترجمه مکارم شیرازی";
    copyAllBtn.onclick = () => this.copyFullPackage();

    const copyTransBtn = copyGroup.createEl("button", {
      cls: "nahj-btn nahj-btn-glass",
      text: "📝 کپی ترجمه"
    });
    copyTransBtn.title = "کپی متن ترجمه فارسی";
    copyTransBtn.onclick = () => this.copyPureTranslation();

    const copyArabBtn = copyGroup.createEl("button", {
      cls: "nahj-btn nahj-btn-glass",
      text: "📋 کپی عربی"
    });
    copyArabBtn.title = "کپی متن عربی کلام";
    copyArabBtn.onclick = () => this.copyPureArabic();

    this.loadData();
  }

  rebuildSelector() {
    this.numberSelect.empty();
    const cat = CATEGORIES[this.categoryKey];
    for (let i = 1; i <= cat.count; i++) {
      const opt = this.numberSelect.createEl("option", {
        value: String(i),
        text: `${cat.singular} شماره ${i}`
      });
      if (i === this.number) opt.selected = true;
    }
  }

  navigateItem(delta) {
    const cat = CATEGORIES[this.categoryKey];
    let newNum = this.number + delta;

    if (newNum > cat.count) newNum = 1;
    if (newNum < 1) newNum = cat.count;

    this.number = newNum;
    this.numberSelect.value = String(newNum);
    this.loadData();
  }

  async loadData() {
    const cat = CATEGORIES[this.categoryKey];
    this.previewCard.innerHTML = `<div style="text-align:center; padding:35px; opacity:0.6;">⏳ در حال بارگذاری سریع...</div>`;
    this.navInfoEl.setText(`${cat.singular} (${this.number} از ${cat.count})`);

    try {
      this.currentData = await fetchNahjItem(this.categoryKey, this.number);
      this.renderPreview();
    } catch (e) {
      this.previewCard.innerHTML = `<div style="color:#ef4444; text-align:center; padding:25px;">❌ خطا در دریافت اطلاعات. اتصال اینترنت را بررسی فرمایید.</div>`;
    }
  }

  renderPreview() {
    if (!this.currentData) return;
    this.previewCard.empty();

    const titleEl = this.previewCard.createDiv({
      attr: { style: "font-weight:bold; color:#0284c7; margin-bottom:12px; font-size:1.1rem; text-align:center;" }
    });
    titleEl.setText(this.currentData.title);

    const arabEl = this.previewCard.createDiv({ cls: "nahj-arabic-text" });
    arabEl.setText(this.currentData.arabic);

    const transEl = this.previewCard.createDiv({ cls: "nahj-translation-text" });
    transEl.setText(this.currentData.translation);
  }

  copyPureArabic() {
    if (!this.currentData) return;
    navigator.clipboard.writeText(this.currentData.arabic.trim());
    new Notice("متن عربی کلام امیر (ع) کپی شد");
  }

  copyPureTranslation() {
    if (!this.currentData) return;
    navigator.clipboard.writeText(this.currentData.translation.trim());
    new Notice("ترجمه کلام امیر (ع) کپی شد");
  }

  copyFullPackage() {
    if (!this.currentData) return;
    const txt = `${this.currentData.title}\n\n${this.currentData.arabic}\n\nترجمه (آیت‌الله مکارم شیرازی):\n${this.currentData.translation}\n\n(نهج‌البلاغه، ${this.currentData.categoryTitle} ${this.currentData.number})`;
    navigator.clipboard.writeText(txt);
    new Notice("پکیج کامل کلام امیر (ع) کپی شد");
  }

  insertToActiveNote() {
    if (!this.currentData) return;
    const callout = `> [!nahj] ${this.currentData.title} (${this.currentData.categoryTitle} ${this.currentData.number})\n> <div class="nahj-arabic-text">${this.currentData.arabic}</div>\n> \n> **ترجمه (آیت‌الله العظمی مکارم شیرازی):**\n> ${this.currentData.translation}\n\n`;

    const activeView = this.app.workspace.getActiveViewOfType(require("obsidian").MarkdownView);
    if (activeView && activeView.editor) {
      activeView.editor.replaceSelection(callout);
      new Notice("کارت شیشه‌ای کلام امیر (ع) در یادداشت درج شد");
      this.close();
    } else {
      new Notice("لطفاً ابتدا داخل یک یادداشت کلیک کنید.");
    }
  }
}

module.exports = class KalamAmirPlugin extends Plugin {
  async onload() {
    this.addRibbonIcon("scroll", "کلام امیر (ع)", () => {
      new KalamAmirGlassModal(this.app, this).open();
    });

    this.addCommand({
      id: "open-kalam-amir-modal",
      name: "باز کردن پنجره کلام امیر (ع)",
      callback: () => {
        new KalamAmirGlassModal(this.app, this).open();
      }
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const selection = editor.getSelection().trim();
        let detected = null;

        if (selection.includes("حکمت")) {
          const num = parseInt(selection.replace(/\D/g, ""), 10);
          if (num) detected = { cat: "wisdom", num };
        } else if (selection.includes("نامه")) {
          const num = parseInt(selection.replace(/\D/g, ""), 10);
          if (num) detected = { cat: "letter", num };
        } else if (selection.includes("خطبه")) {
          const num = parseInt(selection.replace(/\D/g, ""), 10);
          if (num) detected = { cat: "speech", num };
        }

        if (detected) {
          menu.addItem((item) => {
            item
              .setTitle(`📖 باز کردن ${CATEGORIES[detected.cat].singular} ${detected.num} (کلام امیر ع)`)
              .setIcon("scroll")
              .onClick(() => {
                new KalamAmirGlassModal(this.app, this, detected.cat, detected.num).open();
              });
          });
        }
      })
    );
  }
};