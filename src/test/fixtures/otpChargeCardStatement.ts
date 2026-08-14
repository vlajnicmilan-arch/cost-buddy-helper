/**
 * DOSLOVNI ULAZ IZ BAZE — privitak 3b6f8129 (poruka c8e8057d).
 * Mjesečni izvod charge kartice. Izmijenjeno je SAMO ime i adresa vlasnika
 * (osobni podatak); sve ostalo je doslovan `extracted_text` iz
 * `inbound_attachments`, uključujući podnožje s izdavateljem i ukupni zbroj.
 */
export const OTP_CHARGE_CARD_STATEMENT = String.raw`Obavijest o učinjenim troškovima charge karticama
Obavijest broj:
Datum obavijesti:
Datum terećenja:
Broj računa korištenja:
214
01.03.2026.
20.03.2026.
514710744040
KORISNIK PRIMJER
ULICA 1
21000 SPLIT
Broj računa namirenja: HR132407000323449
Valuta terećenja: EUR
Odobreni limit: 3.716,24 EUR
Datum
knjiž.
Datum
valute
Broj
autoriz. Referentni broj i opis transakcije Tečaj Promjena
EUR
44,572805, LIDL HRVATSKA 0215,SPLIT.HRV/12.02/EUR/44,5706758913.02.202613.02.2026
3,392813, LIDL HRVATSKA 0215,SPLIT.HRV/20.02/EUR/3,3962420121.02.202621.02.2026
5,802825, BIPA 7416 SPLIT IV,SPLIT.HRV/20.02/EUR/5,8000267823.02.202623.02.2026
10,802823, ALLORA,SPLIT.HRV/21.02/EUR/10,8004577423.02.202623.02.2026
8,602821, LIDL HRVATSKA 0215,SPLIT.HRV/21.02/EUR/8,6008861923.02.202623.02.2026
1,292817, LIDL HRVATSKA 0215,SPLIT.HRV/21.02/EUR/1,2909522723.02.202623.02.2026
1,992815, TOMMY P-161,SPLIT.HRV/22.02/EUR/1,9930951023.02.202623.02.2026
37,852816, TOMMY P-100,SPLIT.HRV/21.02/EUR/37,8588694523.02.202623.02.2026
7,002830, HZ - KOLODVOR SPLIT,SPLIT.HRV/22.02/EUR/7,0089311525.02.202625.02.2026
9,992831, KIKO MILANO,ZAGREB.HRV/25.02/EUR/9,9909715126.02.202626.02.2026
11,982848, FLIXBUS.COM,BERLIN.DEU/26.02/EUR/11,9801299328.02.202628.02.2026
5,902849, BOLT.EU/O/2602271314,TALLINN.EST/27.02/EUR/5,9085148628.02.202628.02.2026
149,16Za karticu broj: 414968xxxxxx8066 EUR:
12,992803, NETFLIX.COM,LOS GATOS.NLD/08.02/EUR/12,9991043809.02.202609.02.2026
4,732804, VICTA 6,SPLIT.HRV/10.02/EUR/4,7301317211.02.202611.02.2026
1,502807, INT*AUTOMATIC SERVIS,BUZET.HRV/12.02/EUR/1,5060099613.02.202613.02.2026
1,502806, INT*AUTOMATIC SERVIS,BUZET.HRV/12.02/EUR/1,5064837613.02.202613.02.2026
1,502808, INT*AUTOMATIC SERVIS,BUZET.HRV/13.02/EUR/1,5007030314.02.202614.02.2026
1,502809, INT*AUTOMATIC SERVIS,BUZET.HRV/13.02/EUR/1,5007643914.02.202614.02.2026
1,502810, INT*AUTOMATIC SERVIS,BUZET.HRV/17.02/EUR/1,5066310518.02.202618.02.2026
1,502811, INT*AUTOMATIC SERVIS,BUZET.HRV/17.02/EUR/1,5078568118.02.202618.02.2026
8,502826, MLINAR PEKARSKA INDUST,SPLIT.HRV/21.02/EUR/8,5000464023.02.202623.02.2026
24,602814, DM PM 103,SPLIT/22.01/EUR/73,80 2/300684523.02.202623.02.2026
44,552822, CROQUE MADAME,SPLIT.HRV/22.02/EUR/44,5502659623.02.202623.02.2026
1,502820, POS APM SUKOISAN,SPLIT.HRV/22.02/EUR/1,5038631423.02.202623.02.2026
45,462818, INA SPLIT-SPINUT,SPLIT.HRV/22.02/EUR/45,4643750023.02.202623.02.2026
68,152824, MAKA MAKA ST3,ZAGREB.HRV/22.02/EUR/68,1561502823.02.202623.02.2026
13,342819, TOMMY P-128,SPLIT.HRV/21.02/EUR/13,3477547123.02.202623.02.2026
140,002828, POLIKLINIKA PRISKA MED,SPLIT/24.01/EUR/840,00 2/600002524.02.202624.02.2026
51,662829, LIDL HRVATSKA 0215,SPLIT.HRV/23.02/EUR/51,6600347224.02.202624.02.2026
118,672827, SD CITY CENTER ONE SPLI,S/24.12/EUR/1.424,05 3/1214505024.02.202624.02.2026
3,192832, GOOGLE ONE,DUBLIN.IRL/25.02/EUR/3,1909508226.02.202626.02.2026
36,002833, PASSSPORT,ZAGREB.HRV/25.02/EUR/36,0086437626.02.202626.02.2026
28,182836, LIDL HRVATSKA 0215,SPLIT.HRV/26.02/EUR/28,1800586327.02.202627.02.2026
24,802837, CHEVAP,SPLIT.HRV/26.02/EUR/24,8006177927.02.202627.02.2026
50,702838, TEDI FIL. 1822,SPLIT.HRV/26.02/EUR/50,7009114327.02.202627.02.2026
40,002834, BOBIS P-55 CITY,SPLIT.HRV/26.02/EUR/40,0045976127.02.202627.02.2026
13,252835, TISAK P-3060,SPLIT.HRV/26.02/EUR/13,2559633227.02.202627.02.2026
8,002839, JOKER,SPLIT.HRV/26.02/EUR/8,0084212827.02.202627.02.2026
16,802840, CHINESE FOOD,SPLIT.HRV/26.02/EUR/16,8092900827.02.202627.02.2026
11,022843, LIDL HRVATSKA 0215,SPLIT.HRV/27.02/EUR/11,0200790628.02.202628.02.2026
25,512844, LIDL HRVATSKA 0215,SPLIT.HRV/27.02/EUR/25,5100937328.02.202628.02.2026
10,002841, CLEAN 4 YOU,SPLIT.HRV/27.02/EUR/10,0004110428.02.202628.02.2026
5,852842, LIDL HRVATSKA 0215,SPLIT.HRV/27.02/EUR/5,8504987128.02.202628.02.2026
32,922845, WOLT,ZAGREB.HRV/27.02/EUR/32,9206635628.02.202628.02.2026
OTP banka dioničko društvo • Domovinskog rata 61 • 21000 Split, Hrvatska • Tel.: +385 (0)72 21 00 21 • Fax: +385 (0)72 201 950 • Web: www.otpbanka.hr
e-mail: info@otpbanka.hr • MB: 3141721, OIB: 52508873833 • IBAN: HR5324070001024070003
Datum
knjiž.
Datum
valute
Broj
autoriz. Referentni broj i opis transakcije Tečaj Promjena
EUR
26,002846, TEDI FIL. 1822,SPLIT.HRV/27.02/EUR/26,0007499528.02.202628.02.2026
69,002847, PANDORA JOKER,SPLIT.HRV/27.02/EUR/69,0028103128.02.202628.02.2026
944,37Za karticu broj: 414968xxxxxx5968 EUR:
1.093,53Ukupno po računu: 514710744040 EUR:
Sukladno članku 40. stavka 1. Zakona o porezu na dodanu vrijednost ove usluge su oslobođene PDV-a.
Obavještavamo Vas da ćemo 20.03.2026. teretiti Vaš račun HR1324070003234490524 EUR za iznos 1.093,53 EUR te Vas stoga molimo da do
navedenog datuma osigurate potrebna sredstva na računu.
Ukoliko je Vaš račun namirenja u stranoj valuti, teretit će se u odgovarajućoj valuti prema kupovnom tečaju za devize na dan terećenja, a ako na
deviznom računu ne bude dovoljno sredstava s iznosom preostalog duga će se teretiti Vaš tekući račun. U slučaju privremene blokade računa namirenja
zbog ovršnog postupka, terećenje računa se prolongira do prestanka blokade, nakon čega će se direktno teretiti tekući račun.
Sljedeću obavijest o učinjenim troškovima kreditnim karticama poslat ćemo Vam 01.04.2026.
Tečajevi za preračunavanje iz izvorne valute u obračunsku valutu objavljuju se na web stranici http://www.visaeurope.com/en/cardholders/exchange_rates.
aspx, odnosno https://www.mastercard.com/global/en/personal/get-support/convert-currency.html.
SIGURNA ONLINE KUPNJA
Koristite svoju karticu za bezbrižnu kupnju putem interneta u zemlji i inozemstvu.
Sigurnu online kupnju karticama OTP banke d.d. omogućuje 3D Secure usluga koja vam pruža najviši stupanj sigurnosti prilikom plaćanja (Visa i
Mastercard® Identity Check™ sigurnosni standardi).
Ako dosad niste koristili 3D Secure uslugu, molimo vas, aktivirajte m-token u poslovnicama OTP banke kako biste kartice OTP banke d.d. mogli koristiti
za kupnju putem interneta. Detalje o načinu korištenja 3D Secure usluge možete provjeriti i na službenim internetskim stranicama OTP banke d.d., na
poveznici https://www.otpbanka.hr/3-d-secure-program-sigurne-internetske-kupnje ili pozivom na Kontakt centar 0800 21 00 21.
U polju tečaj navodi se primijenjeni tečaj kartičnih kuća kao odnos između iznosa u izvornoj valuti transakcije i iznosa u obračunskoj valuti EUR (iznos u
obračunskoj valuti jednak je iznosu promjene po računu). Ukoliko postoje, u opisu transakcije se navode i vrijednosti „Kon.“ (naknada za konverziju
između iznosa u izvornoj i obračunskoj valuti koja je uključena u iznos transakcije) i „Uk.“ (naknade uključene u iznos transakcije zbrojene s naknadama
koje se posebno naplaćuju po istoj transakciji), obje u valuti EUR.
OTP banka dioničko društvo • Domovinskog rata 61 • 21000 Split, Hrvatska • Tel.: +385 (0)72 21 00 21 • Fax: +385 (0)72 201 950 • Web: www.otpbanka.hr
e-mail: info@otpbanka.hr • MB: 3141721, OIB: 52508873833 • IBAN: HR5324070001024070003
`;
