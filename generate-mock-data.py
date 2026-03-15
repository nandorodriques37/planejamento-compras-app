#!/usr/bin/env python3
"""
Gera dados mock realistas para simular estoque de distribuidora farmacêutica.
Cenários balanceados:
- Produtos que precisam de pedidos todos os meses
- Rupturas (estoque zero) em vários fornecedores
- Excessos de estoque com risco de vencimento (shelf life)
- Warnings (ponto de pedido)
- LT longo com risco
- Tendências de demanda (up/down)
- Transferências (NNA)
"""

import json
import random
import math

random.seed(42)

MESES = [
    "2026_02", "2026_03", "2026_04", "2026_05", "2026_06", "2026_07",
    "2026_08", "2026_09", "2026_10", "2026_11", "2026_12", "2027_01", "2027_02"
]

DIAS_MES = {
    "2026_02": 28, "2026_03": 31, "2026_04": 30, "2026_05": 31,
    "2026_06": 30, "2026_07": 31, "2026_08": 31, "2026_09": 30,
    "2026_10": 31, "2026_11": 30, "2026_12": 31, "2027_01": 31, "2027_02": 28
}

# ============================================================
# FORNECEDORES
# ============================================================
FORNECEDORES = [
    {"nome": "NOVO NORDISK", "PRAZO_PAGAMENTO": 60},
    {"nome": "ROCHE", "PRAZO_PAGAMENTO": 45},
    {"nome": "PFIZER", "PRAZO_PAGAMENTO": 30},
    {"nome": "EUROFARMA", "PRAZO_PAGAMENTO": 28},
    {"nome": "EMS", "PRAZO_PAGAMENTO": 21},
    {"nome": "ACHÉ", "PRAZO_PAGAMENTO": 35},
]

# ============================================================
# PRODUTOS - valores calibrados para gerar necessidade de compra
# ============================================================
# Regra de ouro: estoque_objetivo = (sell/30) * (LT+FREQ+EST_SEG) + IMPACTO
# Para gerar pedidos: estoque_inicial deve ficar ABAIXO do objetivo após 1 mês
# estoque_inicial = ESTOQUE - IMPACTO - PREENCHIMENTO + NNA
#   (PENDENCIA é distribuída via pending-orders, não soma no inicial)

PRODUTOS = [
    # ====== NOVO NORDISK - DIABETES ======
    # OK - estoque cobre ~1 mês, precisa pedir todo mês
    {"cod": 2959, "nome": "INSUL NOVOLIN N 10ML", "forn": "NOVO NORDISK",
     "cat3": "DIABETES", "cat4": "DIABETES-INSULINA",
     "custo": 28.5, "shelf": 912, "dim": [3.0, 7.5, 3.0], "mult": 12,
     "cenarios_cd": {
         # CD1: ok - estoque p/ ~1 mês, pendência pequena
         # objetivo ≈ (350/30)*21 + 15 = 260. estIni = 400-15-10 = 375
         1: {"estoque": 400, "sell_base": 350, "lt": 9, "freq": 7, "est_seg": 5, "impacto": 15, "preench": 10, "pend": 120, "nna": 0, "tipo": "ok"},
         # CD3: RUPTURA - estoque zero, sem pendência
         3: {"estoque": 0, "sell_base": 400, "lt": 9, "freq": 7, "est_seg": 5, "impacto": 20, "preench": 8, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD6: ok
         6: {"estoque": 350, "sell_base": 380, "lt": 11, "freq": 7, "est_seg": 5, "impacto": 12, "preench": 8, "pend": 80, "nna": 0, "tipo": "ok"},
     }},

    # WARNING - estoque baixo, ponto de pedido
    {"cod": 39306, "nome": "INSUL NOVORAPID FLEXPEN SINGLPAC3M", "forn": "NOVO NORDISK",
     "cat3": "DIABETES", "cat4": "DIABETES-INSULINA",
     "custo": 189.9, "shelf": 730, "dim": [17.0, 4.0, 8.0], "mult": 3,
     "cenarios_cd": {
         # CD1 warning: estoque p/ ~5 dias. objetivo ≈ (120/30)*23 + 10 = 102
         # estIni = 60-10-5 = 45. Bem abaixo do objetivo.
         1: {"estoque": 60, "sell_base": 120, "lt": 11, "freq": 7, "est_seg": 5, "impacto": 10, "preench": 5, "pend": 30, "nna": 0, "tipo": "warning"},
         # CD2 warning: estoque p/ ~4 dias
         2: {"estoque": 35, "sell_base": 80, "lt": 14, "freq": 7, "est_seg": 5, "impacto": 8, "preench": 4, "pend": 0, "nna": 0, "tipo": "warning"},
     }},

    # CRITICAL LT LONGO - Ozempic com LT de 34 dias
    {"cod": 53706, "nome": "OZEMPIC 1MG C/1 SISTEMA +4 AGULHA", "forn": "NOVO NORDISK",
     "cat3": "DIABETES", "cat4": "DIABETES-GLP1",
     "custo": 1189, "shelf": 730, "dim": [18.0, 5.0, 10.0], "mult": 1,
     "cenarios_cd": {
         # CD1: LT longo (34 dias), estoque baixíssimo. objetivo ≈ (200/30)*46 + 12 = 319
         # estIni = 15-12-5 = -2. Ruptura técnica + LT longo = urgência extrema
         1: {"estoque": 15, "sell_base": 200, "lt": 34, "freq": 7, "est_seg": 5, "impacto": 12, "preench": 5, "pend": 0, "nna": 0, "tipo": "critical_lt_longo"},
         # CD2: RUPTURA total
         2: {"estoque": 0, "sell_base": 150, "lt": 22, "freq": 7, "est_seg": 5, "impacto": 8, "preench": 3, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
     }},

    # SHELF LIFE RISK - excesso de estoque + shelf life curto (120 dias)
    {"cod": 55975, "nome": "INSUL FIASP FLEXTOUCH 100UI/3ML", "forn": "NOVO NORDISK",
     "cat3": "DIABETES", "cat4": "DIABETES-INSULINA",
     "custo": 245.7, "shelf": 120, "dim": [17.0, 3.5, 3.5], "mult": 3,
     "cenarios_cd": {
         # CD1: 500 un com sell de 50/mês = 10 meses de cobertura vs shelf 120 dias
         1: {"estoque": 500, "sell_base": 50, "lt": 16, "freq": 7, "est_seg": 5, "impacto": 3, "preench": 2, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
         # CD4: mesma situação
         4: {"estoque": 350, "sell_base": 40, "lt": 12, "freq": 7, "est_seg": 5, "impacto": 2, "preench": 1, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
     }},

    # TENDÊNCIA UP - Wegovy com demanda crescente
    {"cod": 77350, "nome": "WEGOVY 1,7MG 3ML C/1 SISTEMA +4", "forn": "NOVO NORDISK",
     "cat3": "DIABETES", "cat4": "DIABETES-GLP1",
     "custo": 2350, "shelf": 730, "dim": [18.0, 5.0, 10.0], "mult": 1,
     "cenarios_cd": {
         # CD1: estoque ok agora mas demanda vai crescer 5%/mês
         # objetivo ≈ (80/30)*38 + 8 = 109. estIni = 90-8-4 = 78
         1: {"estoque": 90, "sell_base": 80, "lt": 26, "freq": 7, "est_seg": 5, "impacto": 8, "preench": 4, "pend": 20, "nna": 0, "tipo": "ok_tendencia_up"},
     }},

    {"cod": 77351, "nome": "WEGOVY 1MG 3ML C/1 SISTEMA +4+", "forn": "NOVO NORDISK",
     "cat3": "DIABETES", "cat4": "DIABETES-GLP1",
     "custo": 2150, "shelf": 730, "dim": [18.0, 5.0, 10.0], "mult": 1,
     "cenarios_cd": {
         # CD1: ok - estoque p/ ~1 mês
         1: {"estoque": 100, "sell_base": 90, "lt": 20, "freq": 7, "est_seg": 5, "impacto": 6, "preench": 3, "pend": 30, "nna": 0, "tipo": "ok"},
         # CD2: warning
         2: {"estoque": 30, "sell_base": 85, "lt": 16, "freq": 7, "est_seg": 5, "impacto": 5, "preench": 3, "pend": 0, "nna": 0, "tipo": "warning"},
     }},

    # ====== ROCHE - ONCOLOGIA (volumes baixos, custos altos) ======
    {"cod": 10101, "nome": "HERCEPTIN 440MG PO INJ FR", "forn": "ROCHE",
     "cat3": "ONCOLOGIA", "cat4": "ONCOLOGIA-ANTICORPOS",
     "custo": 8500, "shelf": 365, "dim": [10.0, 8.0, 10.0], "mult": 1,
     "cenarios_cd": {
         # CD1: LT longo (45 dias) + estoque muito baixo
         # objetivo ≈ (15/30)*66 + 2 = 35. estIni = 5-2-1 = 2
         1: {"estoque": 5, "sell_base": 15, "lt": 45, "freq": 14, "est_seg": 7, "impacto": 2, "preench": 1, "pend": 0, "nna": 0, "tipo": "critical_lt_longo"},
         # CD2: ok - estoque razoável
         2: {"estoque": 20, "sell_base": 12, "lt": 30, "freq": 14, "est_seg": 7, "impacto": 1, "preench": 1, "pend": 5, "nna": 0, "tipo": "ok"},
         # CD7: RUPTURA - estoque zero
         7: {"estoque": 0, "sell_base": 10, "lt": 45, "freq": 14, "est_seg": 7, "impacto": 1, "preench": 0, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
     }},

    {"cod": 10102, "nome": "AVASTIN 400MG/16ML INJ", "forn": "ROCHE",
     "cat3": "ONCOLOGIA", "cat4": "ONCOLOGIA-ANTICORPOS",
     "custo": 5200, "shelf": 365, "dim": [8.0, 6.0, 8.0], "mult": 1,
     "cenarios_cd": {
         # CD1: warning - estoque baixo
         1: {"estoque": 10, "sell_base": 20, "lt": 30, "freq": 14, "est_seg": 7, "impacto": 2, "preench": 1, "pend": 5, "nna": 0, "tipo": "warning"},
         # CD3: ok
         3: {"estoque": 25, "sell_base": 18, "lt": 25, "freq": 14, "est_seg": 7, "impacto": 2, "preench": 1, "pend": 8, "nna": 0, "tipo": "ok"},
     }},

    {"cod": 10103, "nome": "RITUXIMAB 500MG/50ML INJ", "forn": "ROCHE",
     "cat3": "ONCOLOGIA", "cat4": "ONCOLOGIA-ANTICORPOS",
     "custo": 6800, "shelf": 365, "dim": [9.0, 7.0, 9.0], "mult": 1,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 12, "sell_base": 8, "lt": 28, "freq": 14, "est_seg": 7, "impacto": 1, "preench": 1, "pend": 3, "nna": 0, "tipo": "ok"},
         # CD4: RUPTURA
         4: {"estoque": 0, "sell_base": 12, "lt": 35, "freq": 14, "est_seg": 7, "impacto": 1, "preench": 0, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
     }},

    # Shelf life risk em oncologia (estoque alto vs demanda baixa, shelf=90 dias)
    {"cod": 10104, "nome": "XELODA 500MG C/120 COMP", "forn": "ROCHE",
     "cat3": "ONCOLOGIA", "cat4": "ONCOLOGIA-ORAL",
     "custo": 1890, "shelf": 90, "dim": [12.0, 6.0, 8.0], "mult": 1,
     "cenarios_cd": {
         # 200 un / 10 sell mês = 20 meses cobertura vs shelf 90 dias
         1: {"estoque": 200, "sell_base": 10, "lt": 20, "freq": 7, "est_seg": 5, "impacto": 1, "preench": 0, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
         2: {"estoque": 150, "sell_base": 8, "lt": 20, "freq": 7, "est_seg": 5, "impacto": 1, "preench": 0, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
     }},

    # ====== PFIZER - CARDIOLOGIA (volumes altos) ======
    {"cod": 20201, "nome": "LIPITOR 20MG C/30 COMP", "forn": "PFIZER",
     "cat3": "CARDIOLOGIA", "cat4": "CARDIOLOGIA-ESTATINAS",
     "custo": 89.9, "shelf": 730, "dim": [8.0, 3.0, 5.0], "mult": 6,
     "cenarios_cd": {
         # CD1: ok - estoque ~1 mês
         # objetivo ≈ (2000/30)*17 + 50 = 1183. estIni = 2500-50-25+100 = 2525
         # Após mês 1: 2525 + entradas_pend - 2000 ≈ 650. Precisa pedir.
         1: {"estoque": 2500, "sell_base": 2000, "lt": 7, "freq": 7, "est_seg": 3, "impacto": 50, "preench": 25, "pend": 500, "nna": 100, "tipo": "ok"},
         # CD2: ok
         2: {"estoque": 1800, "sell_base": 1500, "lt": 7, "freq": 7, "est_seg": 3, "impacto": 30, "preench": 15, "pend": 300, "nna": 50, "tipo": "ok"},
         # CD3: RUPTURA
         3: {"estoque": 0, "sell_base": 1800, "lt": 10, "freq": 7, "est_seg": 3, "impacto": 40, "preench": 20, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD6: ok
         6: {"estoque": 1500, "sell_base": 1200, "lt": 7, "freq": 7, "est_seg": 3, "impacto": 25, "preench": 12, "pend": 200, "nna": 0, "tipo": "ok"},
     }},

    {"cod": 20202, "nome": "NORVASC 5MG C/30 COMP", "forn": "PFIZER",
     "cat3": "CARDIOLOGIA", "cat4": "CARDIOLOGIA-BCC",
     "custo": 45.5, "shelf": 912, "dim": [7.0, 2.5, 4.0], "mult": 10,
     "cenarios_cd": {
         # CD1: warning
         1: {"estoque": 300, "sell_base": 800, "lt": 7, "freq": 7, "est_seg": 3, "impacto": 20, "preench": 10, "pend": 100, "nna": 30, "tipo": "warning"},
         # CD2: ok
         2: {"estoque": 700, "sell_base": 600, "lt": 7, "freq": 7, "est_seg": 3, "impacto": 15, "preench": 8, "pend": 150, "nna": 0, "tipo": "ok"},
         # CD9: RUPTURA
         9: {"estoque": 0, "sell_base": 500, "lt": 12, "freq": 7, "est_seg": 3, "impacto": 12, "preench": 5, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
     }},

    # Excesso de estoque (mas não shelf life risk pq shelf é longo)
    {"cod": 20203, "nome": "VIAGRA 50MG C/4 COMP", "forn": "PFIZER",
     "cat3": "CARDIOLOGIA", "cat4": "CARDIOLOGIA-PDE5",
     "custo": 120, "shelf": 1095, "dim": [6.0, 2.0, 4.0], "mult": 4,
     "cenarios_cd": {
         # CD1: excesso - 4 meses de estoque (mas shelf longo, sem risco)
         1: {"estoque": 2000, "sell_base": 500, "lt": 5, "freq": 7, "est_seg": 3, "impacto": 5, "preench": 3, "pend": 0, "nna": 0, "tipo": "ok_excesso"},
         # CD4: excesso
         4: {"estoque": 1500, "sell_base": 300, "lt": 5, "freq": 7, "est_seg": 3, "impacto": 3, "preench": 2, "pend": 0, "nna": 0, "tipo": "ok_excesso"},
     }},

    # ====== EUROFARMA - ANTI-INFECCIOSOS (volumes muito altos) ======
    {"cod": 30301, "nome": "AMOXICILINA 500MG C/21 CAPS", "forn": "EUROFARMA",
     "cat3": "ANTI-INFECCIOSOS", "cat4": "ANTI-INFECCIOSOS-PENICILINAS",
     "custo": 18.9, "shelf": 730, "dim": [6.0, 3.0, 4.0], "mult": 12,
     "cenarios_cd": {
         # CD1: ok - estoque ~1 mês
         1: {"estoque": 5500, "sell_base": 5000, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 80, "preench": 40, "pend": 1500, "nna": 200, "tipo": "ok"},
         # CD2: ok
         2: {"estoque": 4500, "sell_base": 4000, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 60, "preench": 30, "pend": 800, "nna": 100, "tipo": "ok"},
         # CD3: warning
         3: {"estoque": 1200, "sell_base": 4500, "lt": 7, "freq": 3, "est_seg": 2, "impacto": 70, "preench": 35, "pend": 500, "nna": 0, "tipo": "warning"},
         # CD4: RUPTURA
         4: {"estoque": 0, "sell_base": 3500, "lt": 8, "freq": 3, "est_seg": 2, "impacto": 50, "preench": 25, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD6: ok
         6: {"estoque": 3500, "sell_base": 3000, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 40, "preench": 20, "pend": 600, "nna": 100, "tipo": "ok"},
         # CD7: ok
         7: {"estoque": 2800, "sell_base": 2500, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 35, "preench": 18, "pend": 400, "nna": 0, "tipo": "ok"},
         # CD9: ok
         9: {"estoque": 2200, "sell_base": 2000, "lt": 6, "freq": 3, "est_seg": 2, "impacto": 30, "preench": 15, "pend": 300, "nna": 0, "tipo": "ok"},
     }},

    {"cod": 30302, "nome": "AZITROMICINA 500MG C/3 COMP", "forn": "EUROFARMA",
     "cat3": "ANTI-INFECCIOSOS", "cat4": "ANTI-INFECCIOSOS-MACROLIDEOS",
     "custo": 25.5, "shelf": 180, "dim": [5.0, 2.0, 3.5], "mult": 10,
     "cenarios_cd": {
         # CD1: shelf life risk - 800 un vs 100/mês sell, shelf 180 dias
         1: {"estoque": 800, "sell_base": 100, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 5, "preench": 3, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
         # CD2: RUPTURA
         2: {"estoque": 0, "sell_base": 1200, "lt": 7, "freq": 3, "est_seg": 2, "impacto": 20, "preench": 10, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD3: ok
         3: {"estoque": 1000, "sell_base": 900, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 15, "preench": 8, "pend": 200, "nna": 0, "tipo": "ok"},
     }},

    {"cod": 30303, "nome": "CIPROFLOXACINO 500MG C/14 COMP", "forn": "EUROFARMA",
     "cat3": "ANTI-INFECCIOSOS", "cat4": "ANTI-INFECCIOSOS-FLUOROQUINOLONAS",
     "custo": 32.0, "shelf": 730, "dim": [7.0, 3.0, 4.5], "mult": 8,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 1700, "sell_base": 1500, "lt": 6, "freq": 3, "est_seg": 2, "impacto": 30, "preench": 15, "pend": 300, "nna": 0, "tipo": "ok"},
         # CD7: warning
         7: {"estoque": 300, "sell_base": 1000, "lt": 8, "freq": 3, "est_seg": 2, "impacto": 20, "preench": 10, "pend": 50, "nna": 0, "tipo": "warning"},
     }},

    # ====== EMS - GENÉRICOS (volumes altíssimos) ======
    {"cod": 40401, "nome": "LOSARTANA 50MG C/30 COMP", "forn": "EMS",
     "cat3": "CARDIOLOGIA", "cat4": "CARDIOLOGIA-BRA",
     "custo": 12.5, "shelf": 912, "dim": [5.0, 2.0, 3.0], "mult": 20,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 9000, "sell_base": 8000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 120, "preench": 60, "pend": 2000, "nna": 500, "tipo": "ok"},
         # CD2: ok
         2: {"estoque": 7000, "sell_base": 6000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 80, "preench": 40, "pend": 1200, "nna": 200, "tipo": "ok"},
         # CD3: RUPTURA
         3: {"estoque": 0, "sell_base": 5000, "lt": 6, "freq": 3, "est_seg": 2, "impacto": 70, "preench": 35, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD4: ok
         4: {"estoque": 4500, "sell_base": 4000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 50, "preench": 25, "pend": 800, "nna": 100, "tipo": "ok"},
         # CD6: ok
         6: {"estoque": 6000, "sell_base": 5500, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 70, "preench": 35, "pend": 1000, "nna": 150, "tipo": "ok"},
         # CD7: warning
         7: {"estoque": 1500, "sell_base": 4500, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 60, "preench": 30, "pend": 200, "nna": 0, "tipo": "warning"},
         # CD9: ok
         9: {"estoque": 4000, "sell_base": 3500, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 40, "preench": 20, "pend": 600, "nna": 0, "tipo": "ok"},
     }},

    {"cod": 40402, "nome": "DIPIRONA 500MG C/30 COMP", "forn": "EMS",
     "cat3": "ANALGÉSICOS", "cat4": "ANALGÉSICOS-PIRAZOLONA",
     "custo": 8.9, "shelf": 1095, "dim": [4.0, 2.0, 3.0], "mult": 24,
     "cenarios_cd": {
         # CD1: ok - produto de altíssimo giro
         1: {"estoque": 16000, "sell_base": 15000, "lt": 3, "freq": 3, "est_seg": 2, "impacto": 150, "preench": 80, "pend": 3000, "nna": 800, "tipo": "ok"},
         # CD2: ok
         2: {"estoque": 13000, "sell_base": 12000, "lt": 3, "freq": 3, "est_seg": 2, "impacto": 100, "preench": 50, "pend": 2000, "nna": 500, "tipo": "ok"},
         # CD3: RUPTURA
         3: {"estoque": 0, "sell_base": 10000, "lt": 5, "freq": 3, "est_seg": 2, "impacto": 80, "preench": 40, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD4: ok
         4: {"estoque": 9000, "sell_base": 8000, "lt": 3, "freq": 3, "est_seg": 2, "impacto": 70, "preench": 35, "pend": 1500, "nna": 300, "tipo": "ok"},
         # CD6: warning
         6: {"estoque": 3000, "sell_base": 9000, "lt": 3, "freq": 3, "est_seg": 2, "impacto": 80, "preench": 40, "pend": 500, "nna": 0, "tipo": "warning"},
     }},

    {"cod": 40403, "nome": "OMEPRAZOL 20MG C/28 CAPS", "forn": "EMS",
     "cat3": "GASTROINTESTINAL", "cat4": "GASTROINTESTINAL-IBP",
     "custo": 15.0, "shelf": 730, "dim": [5.0, 2.5, 3.5], "mult": 14,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 3500, "sell_base": 3000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 40, "preench": 20, "pend": 600, "nna": 100, "tipo": "ok"},
         # CD2: RUPTURA
         2: {"estoque": 0, "sell_base": 2500, "lt": 6, "freq": 3, "est_seg": 2, "impacto": 30, "preench": 15, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD9: ok
         9: {"estoque": 2000, "sell_base": 1800, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 25, "preench": 12, "pend": 300, "nna": 0, "tipo": "ok"},
     }},

    # ====== ACHÉ - RESPIRATÓRIO / DERMATOLOGIA ======
    {"cod": 50501, "nome": "ALLEGRA 120MG C/10 COMP", "forn": "ACHÉ",
     "cat3": "RESPIRATÓRIO", "cat4": "RESPIRATÓRIO-ANTI-HISTAMÍNICO",
     "custo": 35.0, "shelf": 730, "dim": [6.0, 2.5, 4.0], "mult": 10,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 1700, "sell_base": 1500, "lt": 6, "freq": 5, "est_seg": 3, "impacto": 25, "preench": 12, "pend": 300, "nna": 50, "tipo": "ok"},
         # CD2: warning
         2: {"estoque": 400, "sell_base": 1200, "lt": 6, "freq": 5, "est_seg": 3, "impacto": 20, "preench": 10, "pend": 100, "nna": 0, "tipo": "warning"},
         # CD3: RUPTURA
         3: {"estoque": 0, "sell_base": 1000, "lt": 8, "freq": 5, "est_seg": 3, "impacto": 15, "preench": 8, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD4: ok
         4: {"estoque": 900, "sell_base": 800, "lt": 6, "freq": 5, "est_seg": 3, "impacto": 10, "preench": 5, "pend": 150, "nna": 0, "tipo": "ok"},
     }},

    {"cod": 50502, "nome": "SEDALMERCK XAROPE 120ML", "forn": "ACHÉ",
     "cat3": "RESPIRATÓRIO", "cat4": "RESPIRATÓRIO-ANTITUSSÍGENO",
     "custo": 22.0, "shelf": 365, "dim": [5.0, 14.0, 5.0], "mult": 6,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 700, "sell_base": 600, "lt": 5, "freq": 5, "est_seg": 3, "impacto": 10, "preench": 5, "pend": 100, "nna": 0, "tipo": "ok"},
         # CD6: warning
         6: {"estoque": 150, "sell_base": 500, "lt": 7, "freq": 5, "est_seg": 3, "impacto": 8, "preench": 4, "pend": 0, "nna": 0, "tipo": "warning"},
     }},

    {"cod": 50503, "nome": "EPIDRAT CALM LOÇÃO 200ML", "forn": "ACHÉ",
     "cat3": "DERMATOLOGIA", "cat4": "DERMATOLOGIA-HIDRATANTES",
     "custo": 55.0, "shelf": 540, "dim": [6.0, 18.0, 6.0], "mult": 4,
     "cenarios_cd": {
         # CD1: ok
         1: {"estoque": 450, "sell_base": 400, "lt": 8, "freq": 5, "est_seg": 3, "impacto": 8, "preench": 4, "pend": 80, "nna": 0, "tipo": "ok"},
         # CD2: RUPTURA
         2: {"estoque": 0, "sell_base": 350, "lt": 10, "freq": 5, "est_seg": 3, "impacto": 6, "preench": 3, "pend": 0, "nna": 0, "tipo": "critical_ruptura"},
         # CD4: ok
         4: {"estoque": 350, "sell_base": 300, "lt": 8, "freq": 5, "est_seg": 3, "impacto": 5, "preench": 3, "pend": 60, "nna": 0, "tipo": "ok"},
     }},

    # Shelf life risk - shelf curto (150 dias) com excesso
    {"cod": 50504, "nome": "PROCTAN POMADA 25G", "forn": "ACHÉ",
     "cat3": "DERMATOLOGIA", "cat4": "DERMATOLOGIA-PROCTOLOGIA",
     "custo": 42.0, "shelf": 150, "dim": [3.0, 12.0, 3.0], "mult": 6,
     "cenarios_cd": {
         # 300 un / 30 sell mês = 10 meses de cobertura vs shelf 150 dias
         1: {"estoque": 300, "sell_base": 30, "lt": 5, "freq": 5, "est_seg": 3, "impacto": 2, "preench": 1, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
         9: {"estoque": 200, "sell_base": 25, "lt": 5, "freq": 5, "est_seg": 3, "impacto": 1, "preench": 0, "pend": 0, "nna": 0, "tipo": "shelf_life_risk"},
     }},

    # ====== Produtos com NNA alto (transferência entre CDs) ======
    {"cod": 60601, "nome": "METFORMINA 850MG C/30 COMP", "forn": "EMS",
     "cat3": "DIABETES", "cat4": "DIABETES-BIGUANIDAS",
     "custo": 9.5, "shelf": 912, "dim": [5.0, 2.0, 3.5], "mult": 20,
     "cenarios_cd": {
         # CD1: estoque baixo mas NNA grande ajuda - ainda precisa pedir
         # estIni = 500-60-30+5000 = 5410. sell=6000. Após mês 1: -590. Pede.
         1: {"estoque": 500, "sell_base": 6000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 60, "preench": 30, "pend": 200, "nna": 5000, "tipo": "ok_com_nna"},
         # CD2: estoque baixo com NNA
         2: {"estoque": 300, "sell_base": 4000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 40, "preench": 20, "pend": 100, "nna": 3500, "tipo": "ok_com_nna"},
     }},

    # Tendência DOWN - demanda caindo, estoque vai sobrar
    {"cod": 60602, "nome": "GLIBENCLAMIDA 5MG C/30 COMP", "forn": "EMS",
     "cat3": "DIABETES", "cat4": "DIABETES-SULFONILUREIAS",
     "custo": 6.5, "shelf": 912, "dim": [4.5, 2.0, 3.0], "mult": 20,
     "cenarios_cd": {
         # CD1: estoque ~1.2 meses, mas demanda cai 4%/mês
         # objetivo ≈ (1000/30)*9 + 10 = 310. estIni = 1200-10-5 = 1185
         # Mês 1: 1185-1000=185. Abaixo 310. Pede. Mas demanda cai, pedidos diminuem.
         1: {"estoque": 1200, "sell_base": 1000, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 10, "preench": 5, "pend": 0, "nna": 0, "tipo": "ok_tendencia_down"},
         # CD2: similar
         2: {"estoque": 900, "sell_base": 800, "lt": 4, "freq": 3, "est_seg": 2, "impacto": 8, "preench": 4, "pend": 0, "nna": 0, "tipo": "ok_tendencia_down"},
     }},
]


def gerar_sell_out(sell_base, tipo, mes_idx):
    """Gera sell_out com variação e tendências."""
    variacao = random.uniform(0.90, 1.10)

    if "tendencia_up" in tipo:
        # Demanda cresce ~5% ao mês
        fator = 1.0 + (mes_idx * 0.05)
        return max(1, round(sell_base * variacao * fator))
    elif "tendencia_down" in tipo:
        # Demanda cai ~4% ao mês
        fator = max(0.3, 1.0 - (mes_idx * 0.04))
        return max(1, round(sell_base * variacao * fator))
    else:
        # Sazonalidade leve: meses de inverno +10%, verão -5%
        sazonalidade = 1.0
        mes_real = (1 + mes_idx) % 12 + 1
        if mes_real in [5, 6, 7]:
            sazonalidade = 1.10
        elif mes_real in [11, 12, 1]:
            sazonalidade = 0.95
        return max(1, round(sell_base * variacao * sazonalidade))


def gerar_projecao_simples(sell_base, tipo):
    """Gera sell_out por mês para a projeção."""
    meses_data = {}
    for i, mes in enumerate(MESES):
        so = gerar_sell_out(sell_base, tipo, i)
        meses_data[mes] = {
            "SELL_OUT": so,
            "ESTOQUE_PROJETADO": 0,
            "ESTOQUE_OBJETIVO": 0,
            "PEDIDO": 0,
            "ENTRADA": 0
        }
    return meses_data


def main():
    cadastro = []
    projecao = []
    pending_orders = []
    po_counter = 10001

    for prod in PRODUTOS:
        for cd, cenario in prod["cenarios_cd"].items():
            chave = f"{cd}-{prod['cod']}"

            cad = {
                "fornecedor comercial": prod["forn"],
                "situacao": "A",
                "CHAVE": chave,
                "codigo_deposito_pd": cd,
                "codigo_produto": prod["cod"],
                "nome produto": prod["nome"],
                "nome nível 3": prod["cat3"],
                "nome nível 4": prod["cat4"],
                "ESTOQUE": cenario["estoque"],
                "PENDENCIA": cenario["pend"],
                "LT": cenario["lt"],
                "NNA": cenario["nna"],
                "FREQUENCIA": cenario["freq"],
                "EST_SEGURANCA": cenario["est_seg"],
                "IMPACTO": cenario["impacto"],
                "PREECHIMENTO_DEMANDA_LOJA": cenario["preench"],
                "MULTIPLO_EMBALAGEM": prod["mult"],
                "CUSTO_LIQUIDO": prod["custo"],
                "SHELF_LIFE": prod["shelf"],
                "COMPRIMENTO": prod["dim"][0],
                "ALTURA": prod["dim"][1],
                "LARGURA": prod["dim"][2]
            }
            cadastro.append(cad)

            meses_data = gerar_projecao_simples(cenario["sell_base"], cenario["tipo"])
            proj = {
                "CHAVE": chave,
                "meses": meses_data
            }
            projecao.append(proj)

            # Gerar pending orders para SKUs com pendência > 0
            if cenario["pend"] > 0:
                # Distribuir em 1-2 entregas (pendências menores)
                num_entregas = random.choice([1, 2])
                qtd_restante = cenario["pend"]
                datas = ["2026-03-20", "2026-04-10"]

                for j in range(num_entregas):
                    if j == num_entregas - 1:
                        qtd = qtd_restante
                    else:
                        qtd = round(qtd_restante * random.uniform(0.4, 0.6))
                        qtd_restante -= qtd

                    dia = random.randint(15, 28)
                    mes_base = 3 + j
                    if mes_base > 4:
                        mes_base = 4
                    data = f"2026-{mes_base:02d}-{dia:02d}"

                    pending_orders.append({
                        "chave": chave,
                        "numero_pedido": f"PO-{po_counter}",
                        "quantidade": qtd,
                        "data_chegada_prevista": data
                    })
                    po_counter += 1

    data = {
        "metadata": {
            "data_referencia": "2026-03-15",
            "horizonte_meses": 13,
            "meses": MESES,
            "total_skus": len(cadastro),
            "dias_mes": 30
        },
        "cadastro": cadastro,
        "projecao": projecao,
        "fornecedores": FORNECEDORES
    }

    with open("client/public/sample-data.json", "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    with open("client/public/pending-orders.json", "w") as f:
        json.dump(pending_orders, f, indent=2, ensure_ascii=False)

    # Stats
    tipos = {}
    for prod in PRODUTOS:
        for cd, cenario in prod["cenarios_cd"].items():
            t = cenario["tipo"]
            tipos[t] = tipos.get(t, 0) + 1

    fornecedores_set = set(p["forn"] for p in PRODUTOS)
    cat3_set = set(p["cat3"] for p in PRODUTOS)
    cat4_set = set(p["cat4"] for p in PRODUTOS)
    cds_set = set()
    for p in PRODUTOS:
        for cd in p["cenarios_cd"]:
            cds_set.add(cd)

    # Análise de coerência
    print("=" * 60)
    print("RELATÓRIO DE GERAÇÃO DE DADOS MOCK")
    print("=" * 60)
    print(f"  {len(cadastro)} SKUs gerados")
    print(f"  {len(FORNECEDORES)} fornecedores")
    print(f"  {len(cat3_set)} categorias nível 3: {sorted(cat3_set)}")
    print(f"  {len(cat4_set)} categorias nível 4")
    print(f"  {len(cds_set)} CDs: {sorted(cds_set)}")
    print(f"  {len(pending_orders)} pedidos pendentes")
    print(f"\nCenários:")
    for t, count in sorted(tipos.items()):
        print(f"  {t}: {count} SKUs")

    # Verificação de coerência
    print(f"\n{'=' * 60}")
    print("VERIFICAÇÃO DE COERÊNCIA")
    print("=" * 60)

    rupturas = []
    warnings = []
    shelf_risks = []
    excessos = []

    for prod in PRODUTOS:
        for cd, c in prod["cenarios_cd"].items():
            chave = f"{cd}-{prod['cod']}"
            sell_dia = c["sell_base"] / 30
            objetivo = sell_dia * (c["lt"] + c["freq"] + c["est_seg"]) + c["impacto"]
            est_ini = c["estoque"] - c["impacto"] - c["preench"] + c["nna"]
            cobertura_dias = c["estoque"] / sell_dia if sell_dia > 0 else 999

            if c["estoque"] == 0:
                rupturas.append(f"  {chave} ({prod['nome'][:30]})")
            elif est_ini < objetivo * 0.5:
                warnings.append(f"  {chave} - cob: {cobertura_dias:.0f}d, obj: {objetivo:.0f}")
            elif c["tipo"] == "shelf_life_risk":
                shelf_risks.append(f"  {chave} - cob: {cobertura_dias:.0f}d, shelf: {prod['shelf']}d")
            elif c["tipo"] == "ok_excesso":
                excessos.append(f"  {chave} - cob: {cobertura_dias:.0f}d")

    print(f"\nRupturas (estoque=0): {len(rupturas)}")
    for r in rupturas:
        print(r)
    print(f"\nWarnings/Críticos (estoque baixo): {len(warnings)}")
    for w in warnings:
        print(w)
    print(f"\nRisco Shelf Life: {len(shelf_risks)}")
    for s in shelf_risks:
        print(s)
    print(f"\nExcesso: {len(excessos)}")
    for e in excessos:
        print(e)


if __name__ == "__main__":
    main()
