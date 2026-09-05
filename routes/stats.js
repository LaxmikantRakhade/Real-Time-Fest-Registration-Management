const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/stats/summary - Dashboard high-level KPIs and analytics
router.get('/summary', (req, res) => {
  try {
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM events').get().count;
    const totalCapacity = db.prepare('SELECT SUM(max_capacity) as count FROM events').get().count || 0;
    const totalRegistrations = db.prepare('SELECT COUNT(*) as count FROM registrations').get().count;
    const totalCheckedIn = db.prepare('SELECT COUNT(*) as count FROM registrations WHERE checked_in = 1').get().count;
    
    // Total revenue generated
    const revenueRow = db.prepare(`
      SELECT SUM(e.registration_fee) as total_rev
      FROM registrations r
      JOIN events e ON r.event_id = e.id
    `).get();
    const totalRevenue = revenueRow ? revenueRow.total_rev || 0 : 0;

    // Registrations per Category
    const categoryBreakdown = db.prepare(`
      SELECT e.category, COUNT(r.id) as registrations_count, COUNT(DISTINCT e.id) as events_count
      FROM events e
      LEFT JOIN registrations r ON e.id = r.event_id
      GROUP BY e.category
    `).all();

    // Department breakdown
    const departmentBreakdown = db.prepare(`
      SELECT department, COUNT(*) as count
      FROM registrations
      GROUP BY department
      ORDER BY count DESC
      LIMIT 6
    `).all();

    // Top Colleges
    const collegeBreakdown = db.prepare(`
      SELECT college, COUNT(*) as count
      FROM registrations
      GROUP BY college
      ORDER BY count DESC
      LIMIT 6
    `).all();

    // Event-wise live metrics
    const eventStats = db.prepare(`
      SELECT 
        e.id, e.title, e.category, e.max_capacity, e.current_registrations,
        (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id AND r.checked_in = 1) as checked_in,
        ROUND((CAST(e.current_registrations AS FLOAT) / e.max_capacity) * 100, 1) as occupancy_rate
      FROM events e
      ORDER BY e.current_registrations DESC
    `).all();

    // Recent registrations
    const recentRegistrations = db.prepare(`
      SELECT r.id, r.participant_name, r.college, r.registration_time, r.checked_in, e.title as event_title
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      ORDER BY r.registration_time DESC
      LIMIT 8
    `).all();

    res.json({
      success: true,
      data: {
        kpis: {
          total_events: totalEvents,
          total_capacity: totalCapacity,
          total_registrations: totalRegistrations,
          total_checked_in: totalCheckedIn,
          checkin_percentage: totalRegistrations > 0 ? Math.round((totalCheckedIn / totalRegistrations) * 100) : 0,
          total_revenue: totalRevenue
        },
        category_breakdown: categoryBreakdown,
        department_breakdown: departmentBreakdown,
        college_breakdown: collegeBreakdown,
        event_stats: eventStats,
        recent_registrations: recentRegistrations
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/stats/export-csv - Export all attendee registrations to CSV
router.get('/export-csv', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        r.id AS "Registration ID",
        e.title AS "Event",
        e.category AS "Category",
        r.participant_name AS "Lead Name",
        r.email AS "Email",
        r.phone AS "Phone",
        r.college AS "College",
        r.department AS "Department",
        r.year AS "Year",
        COALESCE(r.team_name, 'N/A') AS "Team Name",
        CASE WHEN r.checked_in = 1 THEN 'Yes' ELSE 'No' END AS "Checked In",
        COALESCE(r.checkin_time, 'N/A') AS "Check-in Timestamp",
        r.registration_time AS "Registered At"
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      ORDER BY r.registration_time DESC
    `).all();

    const defaultHeaders = [
      'Registration ID', 'Event', 'Category', 'Lead Name', 
      'Email', 'Phone', 'College', 'Department', 'Year', 
      'Team Name', 'Checked In', 'Check-in Timestamp', 'Registered At'
    ];

    let csvContent = '';
    if (rows.length === 0) {
      csvContent = defaultHeaders.join(',') + '\n';
    } else {
      const headers = Object.keys(rows[0]);
      csvContent = [
        headers.join(','),
        ...rows.map(row => 
          headers.map(header => {
            const val = row[header] ? String(row[header]).replace(/"/g, '""') : '';
            return `"${val}"`;
          }).join(',')
        )
      ].join('\n');
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="fest_registrations_${Date.now()}.csv"`);
    res.status(200).send(csvContent);

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
