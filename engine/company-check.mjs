import { normalizeCompanyName, normalizeOrganizationNumber } from '../server/brreg-client.mjs';

function bool(value) {
  return value === true ? true : value === false ? false : null;
}

export function compareSellerToRegistry({
  seller_name = null,
  seller_org_number = null,
  seller_mva_marker_present = null,
  lookup = null
} = {}) {
  const result = {
    status: lookup?.status ?? 'not_checked',
    source: lookup?.entity?.source ?? 'brreg_enhetsregisteret',
    registry: null,
    comparison: {
      organization_number: 'not_compared',
      name: 'not_compared',
      vat_marker: 'not_compared'
    },
    flags: [],
    customer_note: null
  };

  if (!lookup || !['verified', 'deleted'].includes(lookup.status) || !lookup.entity) {
    if (lookup?.status === 'not_found') result.customer_note = 'Virksomheten ble ikke funnet med opplysningene som kunne kontrolleres.';
    else if (lookup?.status === 'removed') result.customer_note = 'Registeropplysningen er fjernet fra offentlig avgivelse og brukes ikke i analysen.';
    else if (lookup?.status === 'ambiguous' || lookup?.status === 'no_exact_match') result.customer_note = 'Firmanavnet ga ikke ett sikkert registertreff. Fakturasjekk velger ikke virksomhet ved gjetting.';
    else if (lookup?.status === 'invalid_organization_number') result.customer_note = 'Organisasjonsnummeret kunne ikke valideres som et norsk organisasjonsnummer.';
    else if (lookup?.status === 'unavailable') result.customer_note = 'Virksomhetsregisteret var ikke tilgjengelig under kontrollen.';
    return result;
  }

  const entity = lookup.entity;
  result.registry = {
    organization_number: entity.organization_number,
    name: entity.name,
    organization_form: entity.organization_form,
    registered_in_vat: entity.registered_in_vat,
    registered_in_business_register: entity.registered_in_business_register,
    bankrupt: entity.bankrupt,
    under_liquidation: entity.under_liquidation,
    under_forced_liquidation_or_dissolution: entity.under_forced_liquidation_or_dissolution,
    deleted_date: entity.deleted_date,
    registration_date: entity.registration_date,
    business_code: entity.business_code,
    business_address: entity.business_address,
    source: entity.source,
    source_version: entity.source_version
  };

  const invoiceOrg = normalizeOrganizationNumber(seller_org_number);
  if (invoiceOrg) {
    result.comparison.organization_number = invoiceOrg === entity.organization_number ? 'matches' : 'different';
    if (result.comparison.organization_number === 'different') result.flags.push('seller_org_number_mismatch');
  }

  const invoiceName = normalizeCompanyName(seller_name);
  if (invoiceName) {
    const registryName = normalizeCompanyName(entity.name);
    result.comparison.name = invoiceName === registryName ? 'matches' : 'different';
    if (result.comparison.name === 'different') result.flags.push('seller_name_mismatch');
  }

  const marker = bool(seller_mva_marker_present);
  if (marker !== null) {
    if (marker === true && entity.registered_in_vat === false) {
      result.comparison.vat_marker = 'different';
      result.flags.push('seller_mva_marker_mismatch');
    } else if (marker === true && entity.registered_in_vat === true) {
      result.comparison.vat_marker = 'matches';
    } else {
      // A false/absent marker is not automatically treated as a legal mismatch here.
      // Absence must be established by a deterministic complete-document check before it can drive a finding.
      result.comparison.vat_marker = 'not_compared';
    }
  }

  if (entity.deleted_date) result.flags.push('registry_entity_deleted');
  if (entity.bankrupt) result.flags.push('registry_entity_bankrupt');
  if (entity.under_liquidation) result.flags.push('registry_entity_under_liquidation');
  if (entity.under_forced_liquidation_or_dissolution) result.flags.push('registry_entity_under_forced_process');

  result.flags = [...new Set(result.flags)];
  return result;
}

export async function checkSellerCompany({ client, seller_name = null, seller_org_number = null, seller_mva_marker_present = null } = {}) {
  if (!client?.lookupByOrganizationNumber || !client?.searchByExactName) throw new Error('Company check requires Brreg-compatible client.');

  let lookup;
  try {
    if (normalizeOrganizationNumber(seller_org_number)) {
      lookup = await client.lookupByOrganizationNumber(seller_org_number);
    } else if (normalizeCompanyName(seller_name)) {
      lookup = await client.searchByExactName(seller_name);
    } else {
      return compareSellerToRegistry({ seller_name, seller_org_number, seller_mva_marker_present, lookup: { status: 'not_checked', entity: null } });
    }
  } catch (error) {
    lookup = { status: 'unavailable', entity: null, purge_cache: false, error_code: error?.code ?? 'brreg_unavailable' };
  }

  return compareSellerToRegistry({ seller_name, seller_org_number, seller_mva_marker_present, lookup });
}

export function companyCheckFacts(companyCheck = {}) {
  const facts = {};
  const origins = {};
  const entity = companyCheck.registry;
  if (entity) {
    const sourceId = `brreg:${entity.organization_number}`;
    const registryFields = {
      registry_seller_name: entity.name,
      registry_seller_org_number: entity.organization_number,
      registry_seller_mva_registered: entity.registered_in_vat,
      registry_seller_business_register_registered: entity.registered_in_business_register,
      registry_seller_bankrupt: entity.bankrupt,
      registry_seller_under_liquidation: entity.under_liquidation,
      registry_seller_under_forced_process: entity.under_forced_liquidation_or_dissolution,
      registry_seller_deleted_date: entity.deleted_date
    };
    for (const [field, value] of Object.entries(registryFields)) {
      if (value === null || value === undefined) continue;
      facts[field] = value;
      origins[field] = {
        type: 'registry',
        source_id: sourceId,
        confidence: 'authoritative_public_registry',
        note: 'Oppslag i Enhetsregisteret hos Brønnøysundregistrene.'
      };
    }
  }

  for (const flag of companyCheck.flags ?? []) {
    if (flag === 'seller_org_number_mismatch' || flag === 'seller_name_mismatch' || flag === 'seller_mva_marker_mismatch') {
      facts[flag] = true;
      origins[flag] = {
        type: 'calculated',
        source_id: null,
        confidence: 'deterministic',
        note: 'Beregnet sammenligning mellom fakturaopplysning og offentlig registeropplysning.'
      };
    }
  }

  return { facts, origins };
}
