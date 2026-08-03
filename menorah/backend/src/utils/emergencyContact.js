const E164_PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;
const MAX_CONTACT_NAME_LENGTH = 100;
const MAX_RELATIONSHIP_LENGTH = 100;

const inspectEmergencyContact = (value) => {
  if (value === undefined || value === null) {
    return { status: 'empty', contact: null };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      status: 'invalid',
      contact: null,
      message: 'Emergency contact must be an object',
    };
  }

  const fields = ['name', 'relationship', 'phone'];
  if (fields.some((field) => value[field] !== undefined
    && value[field] !== null
    && typeof value[field] !== 'string')) {
    return {
      status: 'invalid',
      contact: null,
      message: 'Emergency contact fields must be text',
    };
  }

  const contact = {
    name: String(value.name || '').trim(),
    relationship: String(value.relationship || '').trim(),
    phone: String(value.phone || '').trim(),
  };
  const populatedCount = Object.values(contact).filter(Boolean).length;

  if (populatedCount === 0) {
    return { status: 'empty', contact: null };
  }

  if (populatedCount !== fields.length) {
    return {
      status: 'invalid',
      contact: null,
      message: 'Provide name, relationship, and phone together, or leave all three blank',
    };
  }

  if (contact.name.length > MAX_CONTACT_NAME_LENGTH) {
    return {
      status: 'invalid',
      contact: null,
      message: `Emergency contact name cannot exceed ${MAX_CONTACT_NAME_LENGTH} characters`,
    };
  }

  if (contact.relationship.length > MAX_RELATIONSHIP_LENGTH) {
    return {
      status: 'invalid',
      contact: null,
      message: `Relationship cannot exceed ${MAX_RELATIONSHIP_LENGTH} characters`,
    };
  }

  if (!E164_PHONE_PATTERN.test(contact.phone)) {
    return {
      status: 'invalid',
      contact: null,
      message: 'Please provide a valid phone number with country code',
    };
  }

  return { status: 'complete', contact };
};

const emergencyContactValidator = (value) => {
  const result = inspectEmergencyContact(value);
  if (result.status === 'invalid') {
    throw new Error(result.message);
  }
  return true;
};

const serializeEmergencyContact = (value) => {
  const result = inspectEmergencyContact(value);
  return result.status === 'complete' ? result.contact : null;
};

module.exports = {
  E164_PHONE_PATTERN,
  inspectEmergencyContact,
  emergencyContactValidator,
  serializeEmergencyContact,
};
