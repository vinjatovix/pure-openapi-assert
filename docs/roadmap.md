# Roadmap: Repositorio de Aserciones de Contrato OpenAPI 3.0 de Estado del Arte

## Objetivo final (reformulado)
Construir y empaquetar una biblioteca de aserciones de contrato OpenAPI 3.0 de nivel industrial, ultraligera y de alto rendimiento (SLO <3ms bajo caché), que se pueda instalar como dependencia en proyectos externos. El sistema debe garantizar un tipado de TypeScript hiper-estricto, cumplir con un límite de complejidad ciclomática de <=10, validar de manera completa las restricciones y el polimorfismo estándar de OpenAPI 3.0 (sin depender de AJV), poseer un pipeline automatizado de CI/CD para verificación de la Constitución, y ofrecer una documentación (README) que justifique técnicamente su superioridad sobre las soluciones existentes.

---

## Iteración 1: Auditoría de Complejidad Ciclomática y Estricta Calidad (Constitución)
- **Valor entregado**: Asegurar de forma verificable que el 100% de la base de código actual cumple con el límite de complejidad ciclomática de <= 10 definido en la Constitución, reduciendo el acoplamiento y forzando que el linter esté en verde de manera dura.
- **Definition of Done**:
  1. Activar la regla de complejidad ciclomática en `eslint.config.js` (`complexity: ["error", 10]`).
  2. Refactorizar todas las funciones en `src/` que violen este límite (especialmente en `src/validators/types.ts` y `src/openapi/router.ts`) dividiéndolas en utilidades puras y desacopladas de una sola responsabilidad.
  3. Ejecutar `pnpm run lint` y verificar que pasa de forma completamente limpia (0 warnings, 0 errors).
  4. Garantizar que todos los tests de Vitest pasen sin modificaciones en sus aserciones lógicas.
- **Dependencias**: Ninguna.
- **Riesgos**: Riesgo bajo de romper la lógica recursiva durante la división de funciones de validación. Mitigado por la suite de 43 tests existentes.
- **Prompt para /speckit.specify**:
```text
Analiza exhaustivamente la complejidad ciclomática de todas las funciones del directorio `src/` (con énfasis en la lógica recursiva de objetos y arrays en `src/validators/types.ts` y en el enrutamiento de `src/openapi/router.ts`). Configura y activa en `eslint.config.js` la regla estricta `complexity` con un límite máximo de 10. Refactoriza quirúrgicamente cualquier función que supere este umbral, extrayendo sub-funciones puras con nombres semánticos y una única responsabilidad para cumplir con las directrices de la Constitución del proyecto. Asegura que el comando `pnpm run lint` pase limpio y que el 100% de la suite de pruebas siga en verde.
```

---

## Iteración 1.1: Optimización de Rendimiento y Memoria (Trade-offs Diferidos)
- **Valor entregado**: Resolver las micro-optimizaciones identificadas durante el Code Review de la Iteración 1 para eliminar la repetición de cómputos de claves (`Object.keys()`) y evitar picos de Garbage Collection en payloads anidados masivamente, todo sin comprometer el principio de Single Responsibility (SRP) ni violar los límites de la Constitución de <=3 parámetros posicionales.
- **Definition of Done**:
  1. **Refactorización a Parameter Objects:** Migrar los argumentos posicionales de los validadores hacia un patrón de Objeto de Parámetros (`options`) para posibilitar la inyección de estado precalculado (como el array de claves de objetos) de forma coherente en todo el motor de tipos.
  2. **Optimización de Pila de Memoria (Context Path):** Sustituir el clonado recursivo de arrays `[...ctx.path]` por una estructura de Lista Enlazada inmutable (Linked List padre->hijo) que resuelva la ruta actual bajo demanda en lugar de reservar miles de micro-arrays en memoria durante composiciones polimórficas anidadas (`anyOf`/`oneOf`/`allOf`).
  3. Ejecutar la suite de tests garantizando un pase limpio y cero regresiones.
- **Dependencias**: Iteración 1.
- **Riesgos**: Bajo. Es una refactorización de rendimiento puramente interna que no afecta a la API pública de aserción.
- **Prompt para /speckit.specify**:
```text
Refactoriza de manera sistemática los validadores de tipos básicos y estructurales en `src/validators/types.ts` aplicando el patrón Parameter Object en lugar de argumentos posicionales múltiples, lo cual permitirá inyectar claves de objeto precalculadas (`Object.keys`) en sub-validadores de propiedades adicionales y requeridas sin violar la restricción constitucional de 3 parámetros posicionales. Asimismo, optimiza la gestión del historial de navegación de rutas en `ValidationContext` migrando de clonado de arreglos nativos a una estructura inmutable de tipo Lista Enlazada para aliviar el recolector de basura (Garbage Collector) en esquemas recursivos complejos. Asegura que el linter continúe en verde y la suite de Vitest pase al 100%.
```

---

## Iteración 2: Completitud OpenAPI 3.0: Formatos Ampliados (`ipv6`, `int32`, `int64`, `float`, `double`, `byte`) e Inyección de `customFormats`
- **Valor entregado**: Soportar de forma nativa la validación estricta de todos los formatos de datos numéricos y de red fundamentales de la especificación OpenAPI 3.0 (incluyendo control de límites de hardware de 32/64 bits) y habilitar la inyección flexible de expresiones o funciones personalizadas.
- **Definition of Done**:
  1. Implementar funciones de validación en `src/validators/format.ts` y `types.ts` para `ipv6` (RFC 4291), `int32`, `int64` (validando seguridad matemática con BigInt/String), `float`, `double`, y `byte` (codificación Base64 válida).
  2. Ampliar la firma de la aserción y el tipo `OpenAPIValidatorInput` para aceptar `customFormats?: Record<string, (val: string) => boolean>`, permitiendo que si el validador encuentra un formato que coincida, dispare el predicado inyectado.
  3. Ampliar `tests/fixtures/mock-openapi.yaml` con esquemas contractuales que combinen estos nuevos formatos estándar y personalizados.
  4. Crear y pasar casos de prueba unitarios e integrados completos en `tests/e2e/assertResponseMatchesOpenAPI.test.ts`.
  5. **(Documentación Requerida):** Documentar explícitamente para los consumidores que, si definen esquemas con límites numéricos gigantescos (fuera de los límites seguros de IEEE 754), deben declararlos como strings en su especificación OpenAPI, o bien en el futuro implementar un analizador lexicográfico personalizado en el parser de OpenAPI para interceptar números extremadamente grandes antes de su coerción por el motor JS.
- **Dependencias**: Iteración 1 (para asegurar que la lógica de formateadores complejos no eleve la complejidad ciclomática por encima de 10).
- **Riesgos**: Complejidad matemática en límites de 64 bits superando el número seguro de JS. Mitigado usando aserciones BigInt/Strings estrictas.
- **Prompt para /speckit.specify**:
```text
Implementa de forma estricta la validación de los formatos estándar de OpenAPI 3.0: `ipv6`, `int32`, `int64` (con BigInt/String), `float`, `double` y `byte` (Base64) en `src/validators/format.ts` y `src/validators/types.ts`. Extiende `OpenAPIValidatorInput` para soportar `customFormats?: Record<string, (val: string) => boolean>`, integrándolo en el motor de validación de cadenas para formatos propietarios de los usuarios. Genera fixtures contractuales en `tests/fixtures/mock-openapi.yaml` para estos formatos y escribe pruebas unitarias y de integración robustas que aseguren cobertura completa y cero violaciones a la Constitución.
```

---

## Iteración 3: Completitud OpenAPI 3.0: Polimorfismo Avanzado mediante `discriminator`
- **Valor entregado**: Soportar la validación optimizada de esquemas compuestos (`oneOf` / `anyOf`) a través de la directiva estándar `discriminator` de OpenAPI 3.0, permitiendo enrutar las aserciones a la rama exacta en base al valor de un campo clave en lugar de ensayar de manera costosa todas las ramas alternativas.
- **Definition of Done**:
  1. Modificar `src/validators/polymorphism.ts` para detectar la propiedad `discriminator` definida en un esquema de composición.
  2. Implementar la resolución de la rama correspondiente del sub-esquema basándose en el valor de la propiedad especificada en `propertyName` y resolviendo el mapeo si existe en `mapping`.
  3. Modificar `tests/fixtures/mock-openapi.yaml` para incluir un esquema polimórfico gobernado por un `discriminator`.
  4. Agregar tests de integración que comprueben que la aserción se dirige a la rama esperada, reportando el error específico de esa única rama si falla, en lugar del árbol genérico de ramas no coincidentes.
- **Dependencias**: Iteración 1 (para asegurar que la lógica polimórfica agregada no rompa el límite de complejidad ciclomática).
- **Riesgos**: Complejidad en la resolución de esquemas. Mitigado por el dereferencing previo que realiza `SwaggerParser`.
- **Prompt para /speckit.specify**:
```text
Añade soporte completo al patrón `discriminator` de OpenAPI 3.0 para polimorfismo estructurado en composiciones `oneOf` y `anyOf`. Modifica `src/validators/polymorphism.ts` para que, al detectar un `discriminator`, extraiga el valor de la propiedad `propertyName` en el objeto recibido y direccione de manera directa la validación hacia el sub-esquema asociado (resolviendo opcionalmente a través del objeto `mapping` del discriminador). Genera fixtures de prueba en `tests/fixtures/mock-openapi.yaml` que usen discriminadores y escribe pruebas robustas que confirmen el direccionamiento exacto de aserciones y la claridad de errores en la rama seleccionada.
```

---

## Iteración 4: Validación de Content-Types de Red y Detección de Obsolescencia (`deprecated`)
- **Valor entregado**: Blindar los tests de integración obligando a la coincidencia estricta de Content-Types declarados en el contrato para evitar falsos positivos con páginas HTML de error de gateways encubiertas, y proveer alertas (Warnings) no bloqueantes en terminal al detectar el uso de rutas o campos declarados obsoletos (`deprecated`).
- **Definition of Done**:
  1. Ampliar `OpenAPIValidatorInput` para aceptar `contentType?: string` (asumiendo por defecto `'application/json'`) y ajustar el tipado de `body` a `unknown` (para soportar strings y Buffers además de objetos).
  2. Modificar `src/openapi/router.ts` para aplicar un **cortocircuito de validación (early exit)** basado en el `contentType`:
     - Si el `contentType` de la respuesta no coincide con las directivas del código de estado (incluyendo variantes `+json` y wildcards `*/*`), aborte inmediatamente con un fallo contractual de Content-Type.
     - Si es `application/json` (o variante compatible `+json`), continuar con la validación profunda (estructural) actual de esquemas.
     - Si es cualquier otro formato (ej. `text/html`, `application/xml`, `application/pdf`, `text/csv`), realizar una validación "opaca" o semántica básica: comprobar únicamente que el `body` es del tipo nativo esperado (`string` para formatos de texto, o `Buffer`/`Blob` para binarios) según el tipo MIME, **sin intentar validar su estructura interna ni iterar sus propiedades**.
  3. Detectar la directiva `deprecated: true` en la ruta resuelta o campos JSON del payload, acumulando alertas legibles en `ValidationContext` e imprimiéndolas mediante `console.warn` en consola de manera controlada sin interrumpir la suite.
  4. Tests pasando de forma limpia y cubriendo todos los casos de error (incluyendo cortocircuitos por tipo no JSON y aserciones de red).
- **Dependencias**: Ninguna.
- **Riesgos**: Ninguno. Es una mejora sustancial en el manejo de metadatos HTTP y warnings de DX.
- **Prompt para /speckit.specify**:
```text
Refactoriza la biblioteca para dar soporte estricto a validaciones de `contentType?: string` y detección de campos/rutas marcadas como `deprecated: true`. Actualiza el tipado del input para que el `body` acepte strings y Buffers. Implementa en `src/openapi/router.ts` coincidencia estricta de tipos de medio (incluyendo variantes `+json` y wildcards `*/*`), fallando inmediatamente si la API devuelve un Content-Type no declarado. Implementa un patrón de cortocircuito (early exit): si el Content-Type no es JSON, evita la validación estructural del esquema y aplica únicamente aserciones nativas opacas (ej. validar que es un `string` si es XML/CSV/HTML, o un `Buffer` si es binario). Adicionalmente, acumula alertas legibles en `ValidationContext` si se consumen elementos obsoletos (`deprecated: true`) e imprímelas mediante console.warn. Añade tests de integración rigurosos para validar estas aserciones de red.
```

---

## Iteración 5: Infraestructura de Integración Continua (CI/CD) y Release Automático
- **Valor entregado**: Establecer el pipeline de calidad definitivo y automatizar el ciclo de vida de empaquetado y publicación dual (ESM/CJS) del repositorio, garantizando que todo cambio cumpla con la Constitución antes de ser distribuido.
- **Definition of Done**:
  1. Crear el archivo `.github/workflows/ci.yml` configurado para ejecutar instalación con pnpm (respetando la versión exacta), build dual con tsup, formateo, linting estricto y ejecución de tests con reporte de cobertura.
  2. Configurar la herramienta `@changesets/cli` para posibilitar la gestión semántica y automatizada de versiones (releases) y generación de Changelogs.
  3. Validar de manera local o mediante simulación que el pipeline se comporta de manera determinista y bloquea de manera dura cualquier PR que introduzca errores o reduzca la cobertura de código por debajo del 95%.
- **Dependencias**: Ninguna.
- **Riesgos**: Desajustes en las configuraciones de caching de dependencias o permisos de publicación en GitHub Actions. Mitigado usando plantillas estándares y seguras de workflows.
- **Prompt para /speckit.specify**:
```text
Diseña y configura el pipeline completo de integración continua (CI) mediante GitHub Actions en `.github/workflows/ci.yml` que valide de manera obligatoria la compilación de la librería (`pnpm build`), el linting estricto (`pnpm run lint`), el formato (`pnpm run format --check`) y la suite completa de tests con límites mínimos del 95% de cobertura (`pnpm run test` con cobertura). Integra e inicializa la herramienta `@changesets/cli` en el repositorio para automatizar la gestión del historial de cambios (changelogs) y versionamiento semántico de releases en preparación para su publicación como dependencia NPM moderna.
```

---

## Iteración 6: Documentación del Estado del Arte y Manual de Adopción (README)
- **Valor entregado**: Proveer un manual de adopción técnico (README) que establezca de forma inconfundible el valor diferenciador de la librería (cero dependencias de runtime, sin incompatibilidades AJV de OpenAPI 3.0, SLO de rendimiento bajo caché de <3ms) y facilite su integración fluida en cualquier proyecto externo de TypeScript/JavaScript.
- **Definition of Done**:
  1. Crear un archivo `README.md` exhaustivo y de calidad industrial.
  2. Describir la justificación de diseño de la biblioteca (explicando la incompatibilidad de dialectos de AJV con OpenAPI 3.0 y la ligereza del motor propio).
  3. Documentar de forma clara y con bloques de código copiables las guías de instalación, integración nativa con Vitest (`expect.extend`), integración con Jest/Supertest y el formato de los errores del ValidationContext.
- **Dependencias**: Ninguna.
- **Riesgos**: Ninguno. Es una iteración enfocada puramente en documentación y DX.
- **Prompt para /speckit.specify**:
```text
Crea un `README.md` de nivel industrial para el proyecto que actúe como carta de presentación técnica y guía detallada de adopción. Debe articular con claridad la propuesta de valor única de `pure-openapi-assert` (cero dependencias pesadas, motor nativo de alto rendimiento que esquiva los problemas de dialectos OpenAPI de AJV, SLO <3ms en caliente) y proveer ejemplos prácticos, interactivos y legibles de instalación, integración contractual con Vitest/Jest, y aserción de API con Supertest, demostrando detalladamente el árbol de errores detallado que arroja en violaciones contractuales.
```
