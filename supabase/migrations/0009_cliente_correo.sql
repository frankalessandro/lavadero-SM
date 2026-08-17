-- M2/M10: dato de contacto adicional para fidelización — el cliente ya se capturaba con
-- nombre y teléfono, ahora se suma el correo (opcional, igual que el teléfono).
alter table ordenes add column cliente_correo text;
