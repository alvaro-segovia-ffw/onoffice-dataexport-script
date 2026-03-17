'use strict';

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [key, cloneValue(nestedValue)]));
  }

  return value;
}

function readPath(source, pathSegments) {
  let current = source;

  for (const segment of pathSegments) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function writePath(target, pathSegments, value) {
  let current = target;

  for (let index = 0; index < pathSegments.length - 1; index += 1) {
    const segment = pathSegments[index];
    if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }

  current[pathSegments[pathSegments.length - 1]] = cloneValue(value);
}

function projectApartment(apartment, policy) {
  if (!apartment || typeof apartment !== 'object') return apartment;

  const allowlist = Array.isArray(policy?.apartmentFieldAllowlist)
    ? policy.apartmentFieldAllowlist.filter(Boolean)
    : [];

  if (allowlist.length === 0) {
    return cloneValue(apartment);
  }

  const projected = {};

  for (const fieldPath of allowlist) {
    const pathSegments = String(fieldPath)
      .split('.')
      .map((segment) => segment.trim())
      .filter(Boolean);

    if (pathSegments.length === 0) continue;

    const value = readPath(apartment, pathSegments);
    if (value === undefined) continue;

    writePath(projected, pathSegments, value);
  }

  return projected;
}

function projectApartments(apartments, policy) {
  return Array.isArray(apartments) ? apartments.map((apartment) => projectApartment(apartment, policy)) : [];
}

module.exports = {
  projectApartment,
  projectApartments,
};
