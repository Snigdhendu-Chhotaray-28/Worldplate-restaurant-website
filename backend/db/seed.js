function seedDatabase(db) {
    const tableTypeCount = db.prepare('SELECT COUNT(*) AS count FROM table_types').get().count;

    if (tableTypeCount === 0) {
        const insertType = db.prepare(`
            INSERT INTO table_types (slug, name, capacity, price_1h, price_2h, sort_order)
            VALUES (@slug, @name, @capacity, @price_1h, @price_2h, @sort_order)
        `);

        const insertTable = db.prepare(`
            INSERT INTO restaurant_tables (table_type_id, table_number)
            VALUES (@table_type_id, @table_number)
        `);

        const defaults = [
            { slug: '2-seater', name: '2-Seater', capacity: 2, price_1h: 399, price_2h: 499, tables: 2 },
            { slug: '4-seater', name: '4-Seater', capacity: 4, price_1h: 599, price_2h: 799, tables: 4 },
            { slug: '6-seater', name: '6-Seater', capacity: 6, price_1h: 999, price_2h: 1299, tables: 2 },
            { slug: 'family-pack', name: 'Family Pack', capacity: 10, price_1h: 1499, price_2h: 1999, tables: 1 }
        ];

        const seed = () => {
            defaults.forEach((type, index) => {
                const result = insertType.run({
                    slug: type.slug,
                    name: type.name,
                    capacity: type.capacity,
                    price_1h: type.price_1h,
                    price_2h: type.price_2h,
                    sort_order: index + 1
                });

                for (let i = 1; i <= type.tables; i += 1) {
                    insertTable.run({
                        table_type_id: Number(result.lastInsertRowid),
                        table_number: i
                    });
                }
            });
        };

        db.exec('BEGIN IMMEDIATE');
        try {
            seed();
            db.exec('COMMIT');
        } catch (err) {
            db.exec('ROLLBACK');
            throw err;
        }
        console.log('[DB] Seeded default table types and inventory.');
    }

    const settingsCount = db.prepare('SELECT COUNT(*) AS count FROM settings').get().count;

    if (settingsCount === 0) {
        db.prepare(`
            INSERT INTO settings (key, value) VALUES
            ('qr_code_path', 'uploads/qr-code.png'),
            ('upi_id', '7751080146@ptyes'),
            ('restaurant_name', 'WorldPlate')
        `).run();
        console.log('[DB] Seeded default settings.');
    }
}

module.exports = { seedDatabase };
