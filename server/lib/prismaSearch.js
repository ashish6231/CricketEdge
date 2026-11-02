/** MariaDB uses the column collation for case sensitivity; Prisma's `mode`
 * option is not supported by the MariaDB connector. */
function userSearchFilters(rawSearch) {
  const search = String(rawSearch || '').trim().slice(0, 120);
  if (!search) return [];
  return [
    { name: { contains: search } },
    { email: { contains: search } },
  ];
}

module.exports = { userSearchFilters };
