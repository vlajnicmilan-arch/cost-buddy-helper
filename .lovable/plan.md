Utvrđeno: ruta `/recovery/receipt-items` postoji u kodu, ali app ju nakon direktnog otvaranja vraća na `/` odnosno landing page prije nego dođe do recovery komponente.

Plan:
1. Dodati `/recovery/receipt-items` u routing grane gdje storage/auth još nisu spremni, da direktni URL ne padne na `* -> /` ili `/auth`.
2. Kad korisnik nije prijavljen u cloud modu, preusmjeriti ga na `/auth` uz `state.from = '/recovery/receipt-items'`, da se nakon prijave može vratiti na recovery stranicu.
3. U auth flowu poštovati `location.state.from` nakon uspješne prijave umjesto uvijek završiti na `/home` / landing.
4. Ograničiti recovery stranicu na prijavljenog korisnika, bez mijenjanja logike vraćanja artikala.
5. Provjeriti preview rutu `/recovery/receipt-items` na mobilnom viewportu 384px i potvrditi da više ne završava na landing pageu.