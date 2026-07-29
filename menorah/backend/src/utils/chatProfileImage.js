const asStringId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  // Mongoose ObjectIds expose an `_id` getter that returns the ObjectId
  // itself. Resolve the ObjectId before looking for a document wrapper so
  // formatting a populated chat message cannot recurse indefinitely.
  if (typeof value.toHexString === 'function') return value.toHexString();
  if (value._id && value._id !== value) return asStringId(value._id);
  return typeof value.toString === 'function' ? value.toString() : null;
};

// A counsellor's verified profile image belongs to the Counsellor record.
// It is mirrored to User on new uploads, but using this fallback also makes
// existing counsellors and partially-migrated records render correctly.
const getCounsellorProfileImage = (counsellor) =>
  counsellor?.profileImage || counsellor?.user?.profileImage || null;

const getChatSenderImage = ({ sender, counsellor }) => {
  const senderId = asStringId(sender);
  const counsellorUserId = asStringId(counsellor?.user);

  if (senderId && counsellorUserId && senderId === counsellorUserId) {
    return getCounsellorProfileImage(counsellor);
  }

  return sender?.profileImage || null;
};

module.exports = {
  asStringId,
  getCounsellorProfileImage,
  getChatSenderImage,
};
