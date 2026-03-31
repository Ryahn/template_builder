FROM php:8.2-apache

RUN printf 'ServerName localhost\n' >> /etc/apache2/apache2.conf

RUN a2enmod rewrite headers

# Mirror repo layout: public → docroot, lib as sibling of public
COPY public/ /var/www/html/public/
COPY lib/ /var/www/html/lib/

WORKDIR /var/www/html/public

RUN printf '%s\n' \
  '<VirtualHost *:80>' \
  '  DocumentRoot /var/www/html/public' \
  '  <Directory /var/www/html/public>' \
  '    AllowOverride None' \
  '    Options -Indexes' \
  '    Require all granted' \
  '    FallbackResource /index.php' \
  '  </Directory>' \
  '  <Directory /var/www/html/lib>' \
  '    Require all denied' \
  '  </Directory>' \
  '</VirtualHost>' \
  > /etc/apache2/sites-available/000-default.conf
