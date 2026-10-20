import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def generate_sample_policy_pdf(output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=45,
        leftMargin=45,
        topMargin=45,
        bottomMargin=45
    )
    styles = getSampleStyleSheet()

    header_style = ParagraphStyle(
        'HeaderStyle',
        parent=styles['Heading1'],
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        alignment=1,
        spaceAfter=6
    )
    sub_style = ParagraphStyle(
        'SubStyle',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#475569"),
        alignment=1,
        spaceAfter=15
    )
    section_style = ParagraphStyle(
        'SectionStyle',
        parent=styles['Heading2'],
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#1e3a8a"),
        spaceBefore=12,
        spaceAfter=6
    )
    body_style = ParagraphStyle(
        'BodyStyle',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=5
    )
    bold_body = ParagraphStyle(
        'BoldBody',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=13.5,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor("#0f172a")
    )

    story = []

    # PAGE 1: DECLARATIONS
    story.append(Paragraph("CHUBB COMMERCIAL CASUALTY & INDEMNITY", header_style))
    story.append(Paragraph("COMMON POLICY DECLARATIONS & SCHEDULE SUMMARY", sub_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#1e3a8a"), spaceAfter=14))

    dec_data = [
        [Paragraph("<b>Policy Number:</b>", body_style), Paragraph("APX-2026-COMM-7789", bold_body), Paragraph("<b>Renewal Of:</b>", body_style), Paragraph("APX-2025-COMM-6120", body_style)],
        [Paragraph("<b>Named Insured:</b>", body_style), Paragraph("Apex Logistics Ltd", bold_body), Paragraph("<b>Account Number:</b>", body_style), Paragraph("APX-84920", body_style)],
        [Paragraph("<b>Mailing Address:</b>", body_style), Paragraph("740 Harbor Parkway, Suite 400, Oakland, CA 94607", body_style), Paragraph("<b>Producer:</b>", body_style), Paragraph("TwinCover Advisory Group", body_style)],
        [Paragraph("<b>Insurer / Carrier:</b>", body_style), Paragraph("Chubb Commercial Casualty Co.", bold_body), Paragraph("<b>Status:</b>", body_style), Paragraph("BINDER CONFIRMED", bold_body)],
        [Paragraph("<b>Effective Date:</b>", body_style), Paragraph("November 01, 2026 at 12:01 AM", bold_body), Paragraph("<b>Expiry Date:</b>", body_style), Paragraph("November 01, 2027 at 12:01 AM", bold_body)],
        [Paragraph("<b>Total Annual Premium:</b>", body_style), Paragraph("$42,850.00 USD", bold_body), Paragraph("<b>Payment Plan:</b>", body_style), Paragraph("Quarterly Commercial Installments", body_style)]
    ]

    t_dec = Table(dec_data, colWidths=[110, 160, 100, 150])
    t_dec.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_dec)
    story.append(Spacer(1, 14))

    story.append(Paragraph("SCHEDULE OF COVERAGES & LIMITS OF LIABILITY", section_style))

    schedule_data = [
        [Paragraph("<b>Coverage Line</b>", bold_body), Paragraph("<b>Limit of Liability</b>", bold_body), Paragraph("<b>Deductible / Retention</b>", bold_body), Paragraph("<b>Annual Premium</b>", bold_body)],
        [Paragraph("Commercial General Liability (CGL)", body_style), Paragraph("$5,000,000 Each Occurrence<br/>$10,000,000 General Aggregate", body_style), Paragraph("Nil (Standard)", body_style), Paragraph("$14,200.00", body_style)],
        [Paragraph("Commercial Property & Buildings", body_style), Paragraph("$10,000,000 Real Property<br/>$2,500,000 Equipment Floater", body_style), Paragraph("$10,000 Per Occurrence", body_style), Paragraph("$16,400.00", body_style)],
        [Paragraph("Cyber Liability & Network Security", body_style), Paragraph("$2,000,000 Annual Aggregate", body_style), Paragraph("<b>$50,000 Each Incident</b>", bold_body), Paragraph("$7,850.00", body_style)],
        [Paragraph("Commercial Auto & Fleet Transit", body_style), Paragraph("$2,000,000 Combined Single Limit", body_style), Paragraph("$2,500 Comp/Collision", body_style), Paragraph("$4,400.00", body_style)],
        [Paragraph("<b>TOTAL ANNUAL POLICY PREMIUM</b>", bold_body), Paragraph("<b>ALL COVERAGES INCLUDED</b>", bold_body), Paragraph("—", bold_body), Paragraph("<b>$42,850.00</b>", bold_body)]
    ]

    t_sch = Table(schedule_data, colWidths=[150, 150, 120, 100])
    t_sch.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#94a3b8")),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, colors.HexColor("#f8fafc")]),
        ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor("#e0e7ff")),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    story.append(t_sch)

    # PAGE 2: CYBER & ENDORSEMENTS
    story.append(PageBreak())
    story.append(Paragraph("ENDORSEMENT CY-889: CYBER RISK & NETWORK SECURITY", header_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e3a8a"), spaceAfter=14))

    story.append(Paragraph("SECTION 1: INSURING AGREEMENTS", section_style))
    story.append(Paragraph(
        "Subject to the Aggregate Cyber Limit of <b>$2,000,000</b> and the Retention specified below, the Underwriter shall pay "
        "on behalf of the Named Insured (<b>Apex Logistics Ltd</b>) all Loss and Defense Expenses resulting from any Cyber Incident, "
        "Extortion Ransom Demand, Data Privacy Breach, or Business Interruption occurring during the Policy Period.",
        body_style
    ))

    story.append(Paragraph("SECTION 2: DEDUCTIBLE & RETENTION SCHEDULE", section_style))
    story.append(Paragraph(
        "The Cyber Deductible for each Cyber Incident is strictly established at <b>$50,000</b>. "
        "The Named Insured shall bear at their own expense the full amount of the deductible before any claim payout by the insurer.",
        body_style
    ))

    story.append(Paragraph("SECTION 3: MANDATORY CYBER SECURITY WARRANTIES", section_style))
    story.append(Paragraph(
        "Coverage under this Cyber Endorsement is strictly conditioned upon the Insured maintaining: "
        "<br/>1. <b>Multi-Factor Authentication (MFA):</b> Deployed across 100% of remote network access, corporate email accounts, and administrative root consoles."
        "<br/>2. <b>Immutable Cloud Backups:</b> Weekly offline or immutable encrypted backups isolated from the corporate Active Directory."
        "<br/>3. <b>Endpoint Detection & Response (EDR):</b> Active monitoring on all logistics terminals and fleet dispatch servers.",
        body_style
    ))

    # PAGE 3: EXCLUSIONS & CONDITIONS
    story.append(PageBreak())
    story.append(Paragraph("GENERAL CONDITIONS & EXCLUSIONS SCHEDULE", header_style))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e3a8a"), spaceAfter=14))

    story.append(Paragraph("EXCLUSION 1: WAR & MILITARY ACTION EXCLUSION", section_style))
    story.append(Paragraph(
        "This policy does NOT apply to loss, damage, or expense caused directly or indirectly by war, hostile or warlike action "
        "in time of peace or war, insurrection, rebellion, revolution, civil war, or action hindering military invasion. "
        "This exclusion applies whether or not war has been formally declared.",
        body_style
    ))

    story.append(Paragraph("EXCLUSION 2: SANCTIONS & EMBARGO COMPLIANCE", section_style))
    story.append(Paragraph(
        "No insurer shall be deemed to provide cover and no insurer shall be liable to pay any claim or provide any benefit "
        "to the extent that the provision of such cover or claim would expose the insurer to any sanction, prohibition or restriction "
        "under United Nations resolutions or trade or economic sanctions.",
        body_style
    ))

    story.append(Paragraph("CONDITION 4: CANCELLATION NOTICE & AUDIT", section_style))
    story.append(Paragraph(
        "The Insurer may cancel this policy by mailing or delivering to the first Named Insured written notice of cancellation at least "
        "<b>30 days</b> before the effective date of cancellation (or <b>10 days</b> for non-payment of premium). "
        "The Named Insured may cancel at any time upon written notification to the brokerage.",
        body_style
    ))

    doc.build(story)
    print(f"Sample commercial policy PDF generated: {output_path}")


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "data", "sample_policies")
    pdf_path = os.path.join(out_dir, "Apex_Logistics_Renewal_Policy_2026.pdf")
    generate_sample_policy_pdf(pdf_path)
