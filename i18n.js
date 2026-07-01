// i18n.js
const translations = {
    en: {
        loading_subtitle: "Initializing collaborative maps...",
        brand_badge: "LIVE",
        connected_users: "Connected Users",
        online: "online",
        layers: "Layers",
        import_geojson: "Import GeoJSON",
        add_marker: "Add Marker",
        no_layers: "No layers yet",
        import_hint: "Import a GeoJSON file to get started",
        markers: "Markers",
        no_markers: "No markers yet",
        marker_hint: "Click 'Add Marker' then click on the map",
        street: "Street",
        satellite: "Satellite",
        dark: "Dark",
        terrain: "Terrain",
        click_to_place: "Click on the map to place a marker",
        cancel: "Cancel",
        edit_marker: "Edit Marker",
        marker_title: "Title",
        marker_title_placeholder: "Enter marker title...",
        marker_description: "Description",
        marker_desc_placeholder: "Enter description...",
        delete: "Delete",
        save: "Save",
        layer_style: "Layer Style",
        layer_name: "Layer Name",
        stroke_color: "Stroke Color",
        fill_color: "Fill Color",
        opacity: "Opacity",
        stroke_weight: "Stroke Weight",
        delete_layer: "Delete Layer",
        apply_style: "Apply",
        search_placeholder: "Search location...",
        toast_layer_added: "Layer added successfully",
        toast_layer_deleted: "Layer deleted",
        toast_marker_added: "Marker added",
        toast_marker_deleted: "Marker deleted",
        toast_marker_updated: "Marker updated",
        toast_error: "An error occurred",
        password_required: "Password Required",
        password_desc: "This is a private site. Please enter the password to access.",
        password_placeholder: "Enter password...",
        password_submit: "Enter App",
        password_error: "Incorrect password, please try again"
    },
    ar: {
        loading_subtitle: "جاري تهيئة الخرائط التفاعلية...",
        brand_badge: "مباشر",
        connected_users: "المستخدمون المتصلون",
        online: "متصل",
        layers: "الطبقات",
        import_geojson: "استيراد GeoJSON",
        add_marker: "إضافة علامة",
        no_layers: "لا توجد طبقات بعد",
        import_hint: "قم باستيراد ملف GeoJSON للبدء",
        markers: "العلامات",
        no_markers: "لا توجد علامات بعد",
        marker_hint: "انقر على 'إضافة علامة' ثم انقر على الخريطة",
        street: "شوارع",
        satellite: "قمر صناعي",
        dark: "مظلم",
        terrain: "تضاريس",
        click_to_place: "انقر على الخريطة لوضع العلامة",
        cancel: "إلغاء",
        edit_marker: "تعديل العلامة",
        marker_title: "العنوان",
        marker_title_placeholder: "أدخل عنوان العلامة...",
        marker_description: "الوصف",
        marker_desc_placeholder: "أدخل الوصف...",
        delete: "حذف",
        save: "حفظ",
        layer_style: "نمط الطبقة",
        layer_name: "اسم الطبقة",
        stroke_color: "لون الإطار",
        fill_color: "لون التعبئة",
        opacity: "الشفافية",
        stroke_weight: "سمك الإطار",
        delete_layer: "حذف الطبقة",
        apply_style: "تطبيق",
        search_placeholder: "ابحث عن موقع...",
        toast_layer_added: "تمت إضافة الطبقة بنجاح",
        toast_layer_deleted: "تم حذف الطبقة",
        toast_marker_added: "تمت إضافة العلامة",
        toast_marker_deleted: "تم حذف العلامة",
        toast_marker_updated: "تم تحديث العلامة",
        toast_error: "حدث خطأ",
        password_required: "مطلوب كلمة المرور",
        password_desc: "هذا الموقع خاص. يرجى إدخال كلمة المرور للوصول إليه.",
        password_placeholder: "أدخل كلمة المرور...",
        password_submit: "دخول التطبيق",
        password_error: "كلمة المرور غير صحيحة، يرجى المحاولة مرة أخرى"
    }
};

class I18nManager {
    constructor() {
        this.currentLang = localStorage.getItem('geosync_lang') || 'en';
        this.init();
    }

    init() {
        this.applyLanguage(this.currentLang);
        
        // Setup toggle buttons
        const toggleBtn = document.getElementById('lang-toggle-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.currentLang = this.currentLang === 'en' ? 'ar' : 'en';
                this.applyLanguage(this.currentLang);
            });
        }

        const passwordToggleBtn = document.getElementById('password-lang-toggle-btn');
        if (passwordToggleBtn) {
            passwordToggleBtn.addEventListener('click', () => {
                this.currentLang = this.currentLang === 'en' ? 'ar' : 'en';
                this.applyLanguage(this.currentLang);
            });
        }
    }

    applyLanguage(lang) {
        // Set document direction and lang
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
        document.documentElement.lang = lang;
        
        // Update local storage
        localStorage.setItem('geosync_lang', lang);

        // Update toggle label
        const langLabel = document.getElementById('lang-label');
        if (langLabel) {
            langLabel.textContent = lang === 'en' ? 'العربية' : 'English';
        }

        const passwordLangLabel = document.getElementById('password-lang-label');
        if (passwordLangLabel) {
            passwordLangLabel.textContent = lang === 'en' ? 'العربية' : 'English';
        }

        // Update all elements with data-i18n attribute
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                el.textContent = translations[lang][key];
            }
        });

        // Update elements with data-i18n-placeholder
        const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
        placeholders.forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.setAttribute('placeholder', translations[lang][key]);
            }
        });

        // Trigger a custom event in case other components need to know
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    }

    t(key) {
        return translations[this.currentLang][key] || key;
    }
}

window.i18n = new I18nManager();
