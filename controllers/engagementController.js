const prisma = require('../prisma/client');
const { validatePopup } = require('../utils/engagementValidation');

const serialize = (popup) => {
  if (!popup) return null;
  const { activeSlot: _activeSlot, ...publicPopup } = popup;
  return { ...publicPopup, schemaVersion: 1, cooldownSeconds: 300, delayMs: 1200 };
};

const popupId = (value) => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const activeConflict = (popup) => ({
  success: false,
  code: 'ACTIVE_POPUP_EXISTS',
  message: 'Another popup campaign is already active. Confirm that it should be stopped first.',
  activePopup: serialize(popup),
});

exports.homePopup = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const popup = await prisma.appPopup.findFirst({ where: { active: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
    return res.json({ success: true, popup: serialize(popup) });
  } catch (error) {
    console.error('homePopup:', error.message);
    return res.status(503).json({ success: false, popup: null, message: 'Announcements unavailable.' });
  }
};

exports.list = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const popups = await prisma.appPopup.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 100 });
    return res.json({ success: true, popups: popups.map(serialize) });
  } catch {
    return res.status(500).json({ success: false, message: 'Unable to load popups.' });
  }
};

exports.save = async (req, res) => {
  let data;
  try { data = validatePopup(req.body); }
  catch (error) { return res.status(400).json({ success: false, message: error.message }); }
  const id = req.params.id ? popupId(req.params.id) : null;
  if (req.params.id && !id) return res.status(400).json({ success: false, message: 'Invalid popup ID.' });
  try {
    if (data.active) {
      const current = await prisma.appPopup.findFirst({
        where: { active: true, ...(id ? { id: { not: id } } : {}) },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });
      if (current && req.body.replaceActive !== true) return res.status(409).json(activeConflict(current));
    }
    const popup = await prisma.$transaction(async (tx) => {
      if (data.active) {
        await tx.appPopup.updateMany({
          where: { active: true, ...(id ? { id: { not: id } } : {}) },
          data: { active: false, activeSlot: null },
        });
      }
      const persisted = { ...data, activeSlot: data.active ? 1 : null };
      return id ? tx.appPopup.update({ where: { id }, data: persisted }) : tx.appPopup.create({ data: persisted });
    });
    return res.status(id ? 200 : 201).json({ success: true, popup: serialize(popup) });
  } catch (error) {
    if (error.code === 'P2002') {
      const current = await prisma.appPopup.findFirst({ where: { active: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] });
      return res.status(409).json(activeConflict(current));
    }
    return res.status(error.code === 'P2025' ? 404 : 500).json({ success: false, message: error.code === 'P2025' ? 'Popup not found.' : 'Unable to save popup.' });
  }
};

exports.remove = async (req, res) => {
  const id = popupId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'Invalid popup ID.' });
  try {
    await prisma.appPopup.delete({ where: { id } });
    return res.json({ success: true, message: 'Popup deleted.' });
  } catch (error) {
    return res.status(error.code === 'P2025' ? 404 : 500).json({ success: false, message: error.code === 'P2025' ? 'Popup not found.' : 'Unable to delete popup.' });
  }
};
