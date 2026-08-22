-- Recargo fijo para motos de alto cilindraje: checkbox en recepción que suma un monto
-- configurable (Admin > Configuración) al precio del combo/servicios, sin necesidad de
-- duplicar la matriz de precios en un tipo de vehículo aparte.
alter table configuracion
  add column recargo_alto_cilindraje integer not null default 5000
    check (recargo_alto_cilindraje >= 0);

alter table ordenes
  add column alto_cilindraje boolean not null default false;
