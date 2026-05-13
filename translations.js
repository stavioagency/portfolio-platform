// User-facing strings only. Code stays English.

export const translations = {
  ar: {
    // Site
    view_portfolio: 'استعرض الأعمال',
    contact: 'تواصل',
    explore: 'استكشف',
    projects: 'المشاريع',
    back: 'رجوع',
    view_project: 'عرض المشروع',
    no_projects: 'لا توجد مشاريع بعد',

    // Admin
    admin_title: 'لوحة التحكم',
    sign_in: 'تسجيل الدخول',
    sign_out: 'تسجيل الخروج',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    save: 'حفظ',
    cancel: 'إلغاء',
    delete: 'حذف',
    saved: 'تم الحفظ',

    nav_profile: 'البروفايل',
    nav_projects: 'المشاريع',
    nav_links: 'الروابط',
    nav_appearance: 'المظهر',
    nav_settings: 'الإعدادات',

    name: 'الاسم',
    tagline: 'الوصف',
    bio: 'نبذة',
    profile_image: 'صورة البروفايل',

    add_project: 'إضافة مشروع',
    project_title: 'عنوان المشروع',
    project_description: 'الوصف',
    cover_image: 'الصورة الرئيسية',
    project_images: 'صور المشروع',
    upload_images: 'رفع الصور',
    drag_drop: 'اسحب الصور هنا أو اضغط للرفع',

    accent_color: 'اللون المميز',
    background_dark: 'لون الخلفية',
    font_choice: 'الخط',
    language_default: 'اللغة الافتراضية'
  },
  en: {
    view_portfolio: 'View Portfolio',
    contact: 'Contact',
    explore: 'Explore',
    projects: 'Projects',
    back: 'Back',
    view_project: 'View Project',
    no_projects: 'No projects yet',

    admin_title: 'Admin Dashboard',
    sign_in: 'Sign In',
    sign_out: 'Sign Out',
    email: 'Email',
    password: 'Password',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    saved: 'Saved',

    nav_profile: 'Profile',
    nav_projects: 'Projects',
    nav_links: 'Links',
    nav_appearance: 'Appearance',
    nav_settings: 'Settings',

    name: 'Name',
    tagline: 'Tagline',
    bio: 'Bio',
    profile_image: 'Profile Image',

    add_project: 'Add Project',
    project_title: 'Project Title',
    project_description: 'Description',
    cover_image: 'Cover Image',
    project_images: 'Project Images',
    upload_images: 'Upload Images',
    drag_drop: 'Drag images here or click to upload',

    accent_color: 'Accent Color',
    background_dark: 'Background Color',
    font_choice: 'Font',
    language_default: 'Default Language'
  }
};

export function getTranslator(lang) {
  return (key) => translations[lang]?.[key] || translations.en[key] || key;
}
